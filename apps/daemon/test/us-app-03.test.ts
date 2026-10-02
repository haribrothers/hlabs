// US-APP-03 · Opening an app that isn't running: Start and Restart work from the window's stopped and "isn't
// responding" states, members the app isn't shared with get FORBIDDEN, and apps.get says when the engine has stopped.
import { ulid } from '@hlabs/shared';
import { apps, users } from '@hlabs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { code: string; hlabsCode: string } } };

async function installed() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const states: string[] = [];
  t.s.bus.on(({ event }) => {
    if (event.type === 'app.stateChanged') states.push(event.data.state);
  });
  const get = async () =>
    (await t.d.query(`apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`)) as Reply;
  return { ...t, states, get };
}

describe('US-APP-03', () => {
  it('Start brings a stopped app back: stopped → starting → running', async () => {
    const t = await installed();
    await t.s.apps.stop('uptime-kuma');
    t.states.length = 0;
    const res = (await t.d.mutate('apps.start', { appId: 'uptime-kuma' })) as Reply;
    expect(res.result?.data).toEqual({ ok: true });
    await vi.waitFor(() => expect(t.states).toEqual(['starting', 'running']));
  });

  it("Restart app on an app that isn't responding starts it again: error → starting → running", async () => {
    const t = await installed();
    t.s.apps.transition('uptime-kuma', 'error');
    t.states.length = 0;
    const res = (await t.d.mutate('apps.restart', { appId: 'uptime-kuma' })) as Reply;
    expect(res.result?.data).toEqual({ ok: true });
    await vi.waitFor(() => expect(t.states).toEqual(['starting', 'running']));
    expect(t.s.db.select().from(apps).get()?.state).toBe('running');
  });

  it("apps.get answers FORBIDDEN to a member the app isn't shared with", async () => {
    const t = await installed();
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${t.s.sessions.create({ userId: member }).raw}`;
    const input = encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }));
    const res = (await (
      await fetch(`${t.d.url}/trpc/apps.get?input=${input}`, { headers: { cookie } })
    ).json()) as Reply;
    expect(res.error?.data).toMatchObject({ code: 'FORBIDDEN', hlabsCode: 'ACCESS_DENIED' });
  });

  it('apps.get says when the container engine has stopped', async () => {
    const t = await installed();
    t.engine.running = false;
    await t.s.engine.check();
    expect((await t.get()).result?.data).toMatchObject({ engineRunning: false });
  });
});
