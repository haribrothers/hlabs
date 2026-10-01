// US-APP-06 · Behaviour switches: "Start automatically" and "Update automatically" save at once with an audit entry
// of the old and new value, custom apps never update automatically, and an app that doesn't start automatically
// stays stopped when the daemon starts.
import { apps, auditLog, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = {
  result?: { data: Record<string, unknown> };
  error?: { data: { code: string; hlabsCode: string } };
};

async function installed() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const row = () => t.s.db.select().from(apps).get()!;
  const get = async () =>
    ((await t.d.query(`apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`)) as Reply)
      .result!.data;
  const audits = (action: string) => t.s.db.select().from(auditLog).where(eq(auditLog.action, action)).all();
  return { ...t, row, get, audits };
}

describe('US-APP-06', () => {
  it('apps.get gives the saved switches', async () => {
    const t = await installed();
    expect(await t.get()).toMatchObject({ autostart: true, autoUpdate: false, custom: false });
  });

  it('"Start automatically" saves at once and the audit log has the old and new value', async () => {
    const t = await installed();
    const res = (await t.d.mutate('apps.setAutostart', { appId: 'uptime-kuma', enabled: false })) as Reply;
    expect(res.result?.data).toEqual({ ok: true });
    expect(t.row().autostart).toBe(false);
    expect(t.audits('app.setAutostart')).toEqual([
      expect.objectContaining({ target: 'uptime-kuma', detailJson: { from: true, to: false } }),
    ]);
  });

  it('"Update automatically" saves at once, audited', async () => {
    const t = await installed();
    await t.d.mutate('apps.setAutoUpdate', { appId: 'uptime-kuma', enabled: true });
    expect(t.row().autoUpdate).toBe(true);
    expect(t.audits('app.setAutoUpdate')).toEqual([expect.objectContaining({ detailJson: { from: false, to: true } })]);
  });

  it('custom apps never update automatically', async () => {
    const t = await installed();
    t.s.db.update(apps).set({ custom: true }).run();
    const res = (await t.d.mutate('apps.setAutoUpdate', { appId: 'uptime-kuma', enabled: true })) as Reply;
    expect(res.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect(t.row().autoUpdate).toBe(false);
  });

  it('with "Start automatically" off, an app that is down when the daemon starts stays stopped', async () => {
    const t = await installed();
    await t.d.mutate('apps.setAutostart', { appId: 'uptime-kuma', enabled: false });
    // The computer restarted: the containers are down, the app was running.
    for (const containers of t.engine.containers.values()) for (const c of containers) c.state = 'exited';
    await t.s.apps.reconcile();
    expect(t.row().state).toBe('stopped');
  });

  it('with it on, the same app is started again', async () => {
    const t = await installed();
    for (const containers of t.engine.containers.values()) for (const c of containers) c.state = 'exited';
    await t.s.apps.reconcile();
    expect(t.row().state).toBe('running');
  });

  it('members get FORBIDDEN', async () => {
    const t = await installed();
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${t.s.sessions.create({ userId: member }).raw}`;
    const me = (await (await fetch(`${t.d.url}/trpc/auth.me`, { headers: { cookie } })).json()) as Reply;
    const res = (await (
      await fetch(`${t.d.url}/trpc/apps.setAutostart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, 'x-hlabs-csrf': me.result!.data.csrfToken as string },
        body: JSON.stringify({ appId: 'uptime-kuma', enabled: false }),
      })
    ).json()) as Reply;
    expect(res.error?.data).toMatchObject({ code: 'FORBIDDEN', hlabsCode: 'ACCESS_DENIED' });
    expect(t.row().autostart).toBe(true);
  });
});
