// US-STATE-10 · Recover automatically when the engine comes back (the daemon's side): the 10 s check sees it, says so
// on the event stream, marks the admins' "engine stopped" notification read and brings apps back.
import { apps, getSetting, notifications, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_STOPPED_KIND } from '../src/engine/watch';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-STATE-10', () => {
  it('an engine started elsewhere is noticed, its notification read, and the apps come back', async () => {
    const t = await installDaemon(closers);
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as {
      result: { data: { jobId: string } };
    };
    await t.s.jobs.settled(res.result.data.jobId);
    setSetting(t.s.db, 'onboarding', { ...getSetting(t.s.db, 'onboarding'), completedAt: Date.now() });
    const events: Array<{ type: string; data: unknown }> = [];
    t.s.bus.on(({ event }) => events.push(event));

    for (const containers of t.engine.containers.values()) for (const c of containers) c.state = 'exited';
    t.engine.running = false;
    await t.s.engine.check();
    const stopped = () => t.s.db.select().from(notifications).where(eq(notifications.kind, ENGINE_STOPPED_KIND)).get();
    expect(stopped()?.readAt).toBeNull();

    // Someone opens OrbStack; the daemon's next check finds it.
    const before = t.compose.calls.length;
    t.engine.running = true;
    await t.s.engine.check();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'engine.status', data: expect.objectContaining({ running: true }) }),
    );
    expect(stopped()?.readAt).not.toBeNull();
    expect(events).toContainEqual(expect.objectContaining({ type: 'notification.read' }));
    // Its containers were down: the app is brought up again.
    await vi.waitFor(() => expect(t.compose.calls.slice(before).map((c) => c.op)).toContain('up'));
    await vi.waitFor(() => expect(t.s.db.select().from(apps).get()?.state).toBe('running'));
  });
});
