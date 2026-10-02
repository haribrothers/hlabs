// US-APP-02 · App window controls: apps.restart for admins, answered at once, with the outcome as app.stateChanged.
import { ulid } from '@hlabs/shared';
import { apps, users } from '@hlabs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function installed() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  return t;
}

describe('US-APP-02', () => {
  it('restart answers at once; the app goes restarting → running and says so on the event stream', async () => {
    const t = await installed();
    const states: string[] = [];
    t.s.bus.on(({ event }) => {
      if (event.type === 'app.stateChanged') states.push(event.data.state);
    });
    let open!: () => void;
    t.compose.gate = new Promise<void>((r) => (open = r));
    const res = (await t.d.mutate('apps.restart', { appId: 'uptime-kuma' })) as Reply;
    expect(res.result?.data).toEqual({ ok: true });
    expect(t.s.db.select().from(apps).get()?.state).toBe('restarting');
    open();
    await vi.waitFor(() => expect(states).toEqual(['restarting', 'running']));
  });

  it("a restart the state machine doesn't allow is refused with APP_BUSY", async () => {
    const t = await installed();
    t.s.apps.transition('uptime-kuma', 'stopping');
    const res = (await t.d.mutate('apps.restart', { appId: 'uptime-kuma' })) as Reply;
    expect(res.error?.data.hlabsCode).toBe('APP_BUSY');
  });

  it("members can't restart apps", async () => {
    const t = await installed();
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${t.s.sessions.create({ userId: member }).raw}`;
    const me = (await (await fetch(`${t.d.url}/trpc/auth.me`, { headers: { cookie } })).json()) as Reply;
    const res = (await (
      await fetch(`${t.d.url}/trpc/apps.restart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, 'x-hlabs-csrf': me.result!.data.csrfToken as string },
        body: JSON.stringify({ appId: 'uptime-kuma' }),
      })
    ).json()) as Reply;
    expect(res.error?.data.hlabsCode).toBe('ACCESS_DENIED');
    expect(t.s.db.select().from(apps).get()?.state).toBe('running');
  });
});
