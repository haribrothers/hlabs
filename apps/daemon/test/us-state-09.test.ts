// US-STATE-09 · Start the engine from the banner: settings.engine.start runs an engine_start job that starts the
// engine with its own command, waits for it, brings apps back and is audited; a second press gets the same job.
import { hlabsCodeOf } from '@hlabs/api';
import { apps, auditLog, getSetting, jobs as jobsTable, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { EngineControl } from '../src/engine/control';
import { registerEngineStart } from '../src/engine/start-job';
import type { EngineCandidate } from '../src/engine/types';
import { FakeEngineControl } from './fakes/engine-control';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: { jobId: string } }; error?: { data: { hlabsCode: string } } };

async function stoppedWithKuma() {
  const control = new FakeEngineControl();
  const t = await installDaemon(closers, { engineControl: control });
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId);
  setSetting(t.s.db, 'onboarding', { ...getSetting(t.s.db, 'onboarding'), completedAt: Date.now() });
  // The engine stopped, taking the app's containers with it.
  for (const containers of t.engine.containers.values()) for (const c of containers) c.state = 'exited';
  t.engine.running = false;
  await t.s.engine.check();
  return { ...t, control };
}

describe('US-STATE-09', () => {
  it('starts the engine with its own command, waits for it, brings apps back, and audits it', async () => {
    const t = await stoppedWithKuma();
    t.control.onStart = () => {
      t.engine.running = true;
    };
    const res = (await t.d.mutate('settings.engine.start')) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId);
    expect(t.control.starts).toHaveLength(1);
    expect(t.s.engine.status.state).toBe('running');
    expect(t.s.db.select().from(jobsTable).where(eq(jobsTable.id, res.result!.data.jobId)).get()).toMatchObject({
      kind: 'engine_start',
      state: 'succeeded',
    });
    expect(t.s.db.select().from(apps).get()?.state).toBe('running');
    expect(t.s.db.select().from(auditLog).where(eq(auditLog.action, 'engine.start')).all()).toHaveLength(1);
  });

  it('a second press while it starts returns the same job', async () => {
    const t = await stoppedWithKuma();
    let release!: () => void;
    t.control.onStart = () =>
      new Promise<void>((r) => {
        release = () => {
          t.engine.running = true;
          r();
        };
      });
    const first = (await t.d.mutate('settings.engine.start')) as Reply;
    const second = (await t.d.mutate('settings.engine.start')) as Reply;
    expect(second.result!.data.jobId).toBe(first.result!.data.jobId);
    await new Promise((r) => setTimeout(r, 10));
    release();
    await t.s.jobs.settled(first.result!.data.jobId);
  });

  it('a start command that fails fails the job with ENGINE_START_FAILED', async () => {
    const t = await stoppedWithKuma();
    t.control.onStart = () => {
      throw Object.assign(new Error('open -a OrbStack failed'), {});
    };
    const res = (await t.d.mutate('settings.engine.start')) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId).catch(() => undefined);
    expect(t.s.db.select().from(jobsTable).where(eq(jobsTable.id, res.result!.data.jobId)).get()?.state).toBe('failed');
  });

  it("an engine that doesn't answer in time fails with ENGINE_START_FAILED", async () => {
    const candidate: EngineCandidate = { kind: 'orbstack', socketPath: '/x.sock', managedByHlabs: false };
    let run!: (ctx: never) => Promise<void>;
    registerEngineStart({
      jobs: { register: (_kind: string, def: { run: typeof run }) => (run = def.run) } as never,
      engine: {
        status: { state: 'stopped', candidate },
        lastCandidate: candidate,
        check: async () => ({ state: 'stopped', candidate }),
      },
      control: { start: async () => {} } as unknown as EngineControl,
      db: { insert: () => ({ values: () => ({ run: () => {} }) }) } as never,
      appsBack: async () => {},
      startWithinMs: 5,
      pollMs: 1,
    });
    const failure = await run({
      payload: { userId: null },
      signal: new AbortController().signal,
      report: () => {},
    } as never).catch((err: unknown) => err);
    expect(hlabsCodeOf(failure)).toBe('ENGINE_START_FAILED');
  });

  it('members get FORBIDDEN', async () => {
    const t = await stoppedWithKuma();
    const { users } = await import('@hlabs/db');
    const { ulid } = await import('@hlabs/shared');
    const id = ulid();
    t.s.db
      .insert(users)
      .values({ id, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${t.s.sessions.create({ userId: id }).raw}`;
    const me = (await (await fetch(`${t.d.url}/trpc/auth.me`, { headers: { cookie } })).json()) as {
      result: { data: { csrfToken: string } };
    };
    const res = (await (
      await fetch(`${t.d.url}/trpc/settings.engine.start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, 'x-hlabs-csrf': me.result.data.csrfToken },
        body: '{}',
      })
    ).json()) as Reply;
    expect(res.error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
