// US-SYS-31 · Restart hlabs (server side): system.restartDaemon stops every app that is up (remembered, as Quit does),
// says `restarting` on /healthz and the event stream, then has launchd or systemd start hlabsd again (exit 75); the
// next start brings the same apps back. Refused while an exclusive job runs; admins only; audited.
import type { HlabsEvent } from '@hlabs/api';
import { apps, auditLog, getSetting, jobs } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { shutdown } from '../src/boot';
import { RESTART_EXIT_CODE } from '../src/system/lifecycle';
import type { Reply } from './admin-session';
import { installDaemon } from './install-harness';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
};

async function setup() {
  let restarts = 0;
  const t = await installDaemon(closers, { restartDaemon: () => void restarts++ });
  t.s.appWatch.stop();
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const state = () => t.s.db.select({ state: apps.state }).from(apps).where(eq(apps.id, 'uptime-kuma')).get()?.state;
  return { ...t, state, restarts: () => restarts };
}

describe('US-SYS-31', () => {
  it('stops every app, says it is restarting, starts hlabs again, and the next start brings the apps back', async () => {
    const t = await setup();
    expect(t.state()).toBe('running');
    const events: HlabsEvent[] = [];
    t.s.bus.on((e) => events.push(e.event));

    expect(((await t.d.mutate('system.restartDaemon')) as Reply).result!.data).toEqual({ ok: true });
    const health = await fetch(`${t.d.url}/healthz`);
    expect(health.status).toBe(503);
    expect(await health.json()).toEqual({ reason: 'restarting' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'system.status', data: { state: 'restarting' } }));
    // Every API call waits while it restarts.
    expect(((await t.d.query('apps.list')) as Reply).error?.data.hlabsCode).toBe('DAEMON_STARTING');

    await until(() => t.restarts() === 1);
    expect(t.restarts()).toBe(1);
    expect(t.state()).toBe('stopped');
    expect(getSetting(t.s.db, 'paused')).toMatchObject({ appIds: ['uptime-kuma'], untilRestart: true });
    expect(
      t.s.db
        .select()
        .from(auditLog)
        .all()
        .find((a) => a.action === 'system.restart'),
    ).toMatchObject({
      userId: t.d.userId,
      detailJson: { appIds: ['uptime-kuma'] },
    });
    expect(RESTART_EXIT_CODE).toBe(75);

    // launchd or systemd starts it again: the same apps come back.
    await shutdown(t.d.holder.current);
    const again = await t.d.boot();
    t.d.holder.set(again!);
    again!.appWatch.stop();
    await until(() => again!.db.select().from(apps).get()?.state === 'running');
    expect(again!.db.select().from(apps).get()?.state).toBe('running');
    expect(getSetting(again!.db, 'paused')).toBeNull();
  });

  it('is refused while an exclusive job runs, and for members', async () => {
    const t = await setup();
    const anu = await memberSession(t.d);
    expect((await anu.mutate('system.restartDaemon')).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    t.s.db.insert(jobs).values({ id: ulid(), kind: 'restore', state: 'running', progress: 0, createdAt: 1 }).run();
    const reply = (await t.d.mutate('system.restartDaemon')) as Reply;
    expect(reply.error?.data).toMatchObject({ hlabsCode: 'JOB_EXCLUSIVE_RUNNING', detail: { runningKind: 'restore' } });
    expect((await fetch(`${t.d.url}/healthz`)).status).toBe(200);
    expect(t.state()).toBe('running');
    expect(t.restarts()).toBe(0);
  });
});
