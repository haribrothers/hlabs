// US-INST-10 · Quit hlabs (D-120), server side: tray.quit stops every app (data untouched), audited as a quit, and
// answers once they're stopped; the next start brings back the apps that were up. An earlier pause stays a pause; an
// update or a restore running refuses it.
import { auditLog, getSetting, jobs as jobsTable } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { shutdown } from '../src/boot';
import { startDaemon } from './helpers';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: { jobId: string } } };

async function withKuma() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId);
  await t.s.reconciled;
  expect(t.s.apps.get('uptime-kuma')?.state).toBe('running');
  return t;
}

const quit = async (t: Awaited<ReturnType<typeof withKuma>>) =>
  t.s.jobs.settled(t.s.jobs.start('pause_all', { payload: { via: 'tray', untilRestart: true } }));

describe('US-INST-10 · Quit hlabs', () => {
  it('quitting stops every app, audited as a quit; the next start brings them back', async () => {
    const t = await withKuma();
    await quit(t);
    expect(t.s.apps.get('uptime-kuma')?.state).toBe('stopped');
    expect(getSetting(t.s.db, 'paused')).toMatchObject({ appIds: ['uptime-kuma'], untilRestart: true });
    const audit = t.s.db.select().from(auditLog).where(eq(auditLog.action, 'system.quit')).get();
    expect(audit?.detailJson).toEqual({ via: 'tray', appIds: ['uptime-kuma'] });

    // hlabs starts again (opened, or at login).
    await shutdown(t.s);
    const s2 = (await t.d.boot())!;
    await s2.reconciled;
    await expect.poll(() => s2.apps.get('uptime-kuma')?.state, { timeout: 5_000 }).toBe('running');
    expect(getSetting(s2.db, 'paused')).toBeNull();
    await shutdown(s2);
  });

  it('apps paused before quitting stay paused after the next start', async () => {
    const t = await withKuma();
    await t.s.jobs.settled(t.s.jobs.start('pause_all', { payload: { via: 'tray' } }));
    await quit(t);
    expect(getSetting(t.s.db, 'paused')).toMatchObject({ untilRestart: false });
    await shutdown(t.s);
    const s2 = (await t.d.boot())!;
    await s2.reconciled;
    await new Promise((r) => setTimeout(r, 100));
    expect(s2.apps.get('uptime-kuma')?.state).toBe('stopped');
    await shutdown(s2);
  });

  describe('tray.quit', () => {
    const TOKEN = newTrayToken();
    async function daemon() {
      const d = await startDaemon({
        config: { devAnonymousAdmin: false },
        trayTokens: new TrayTokens({ read: async () => TOKEN }),
      });
      closers.push(d.close);
      return d;
    }
    const call = async (url: string) => {
      const res = await fetch(`${url}/trpc/tray.quit?batch=1`, {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: '{}',
      });
      return ((await res.json()) as Array<{ result?: { data: unknown }; error?: { data: { hlabsCode: string } } }>)[0]!;
    };

    it('answers once the apps are stopped', async () => {
      const d = await daemon();
      expect((await call(d.url)).result?.data).toEqual({ ok: true });
      const job = d.services!.db.select().from(jobsTable).where(eq(jobsTable.kind, 'pause_all')).get();
      expect(job?.state).toBe('succeeded');
    });

    it('waits for an update or a restore: JOB_EXCLUSIVE_RUNNING', async () => {
      const d = await daemon();
      d.services!.db.insert(jobsTable)
        .values({ id: ulid(), kind: 'restore', state: 'running', createdAt: Date.now() })
        .run();
      expect((await call(d.url)).error?.data.hlabsCode).toBe('JOB_EXCLUSIVE_RUNNING');
    });
  });
});
