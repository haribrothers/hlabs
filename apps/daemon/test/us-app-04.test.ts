// US-APP-04 · See an app's status and start, stop or restart it: apps.get gives the web container's start time for the
// uptime, Stop and Start answer at once and report through app.stateChanged, a stopped app stays stopped when the
// daemon starts again, and members can't use any of them.
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
    ((await t.d.query(`apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`)) as Reply)
      .result!.data;
  return { ...t, states, get };
}

describe('US-APP-04', () => {
  it("apps.get gives when the web container started while it runs, and null once it's stopped", async () => {
    const t = await installed();
    const [project] = [...t.engine.containers.keys()];
    const web = t.engine.containers.get(project!)!.find((c) => c.service === 'uptime-kuma')!;
    expect((await t.get()).startedAt).toBe(web.startedAt);
    await t.s.apps.stop('uptime-kuma');
    expect((await t.get()).startedAt).toBeNull();
  });

  it('Stop answers at once and the app goes stopping → stopped; Start brings it back', async () => {
    const t = await installed();
    expect(((await t.d.mutate('apps.stop', { appId: 'uptime-kuma' })) as Reply).result?.data).toEqual({ ok: true });
    await vi.waitFor(() => expect(t.states).toEqual(['stopping', 'stopped']));
    expect(((await t.d.mutate('apps.start', { appId: 'uptime-kuma' })) as Reply).result?.data).toEqual({ ok: true });
    await vi.waitFor(() => expect(t.states).toEqual(['stopping', 'stopped', 'starting', 'running']));
  });

  it('an app someone stopped stays stopped when the daemon starts again', async () => {
    const t = await installed();
    await t.s.apps.stop('uptime-kuma');
    await t.s.apps.reconcile();
    expect(t.s.db.select().from(apps).get()?.state).toBe('stopped');
  });

  it('members get FORBIDDEN from start, stop and restart', async () => {
    const t = await installed();
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${t.s.sessions.create({ userId: member }).raw}`;
    const me = (await (await fetch(`${t.d.url}/trpc/auth.me`, { headers: { cookie } })).json()) as Reply;
    for (const action of ['start', 'stop', 'restart']) {
      const res = (await (
        await fetch(`${t.d.url}/trpc/apps.${action}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie,
            'x-hlabs-csrf': me.result!.data.csrfToken as string,
          },
          body: JSON.stringify({ appId: 'uptime-kuma' }),
        })
      ).json()) as Reply;
      expect(res.error?.data).toMatchObject({ code: 'FORBIDDEN', hlabsCode: 'ACCESS_DENIED' });
    }
    expect(t.s.db.select().from(apps).get()?.state).toBe('running');
  });
});
