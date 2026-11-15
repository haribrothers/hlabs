// US-APP-26 · Know when an app stops working: a running app whose container stays down for 30 s, is restarted by
// Docker 3 times in 5 minutes or is unhealthy for 60 s goes to error, and the admins are told once; a blip Docker
// fixes by itself, or anything hlabs does to the app, isn't a crash; an app that comes back by itself is running again.
import { notifications } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CRASHED_KIND, RECOVERED_KIND } from '../src/apps/app-watch';
import { MANIFEST_COPY } from '../src/apps/service';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const APP = 'uptime-kuma';

async function running() {
  const t = await installDaemon(closers);
  t.s.appWatch.stop();
  const res = (await t.d.mutate('apps.install', { appId: APP })) as { result: { data: { jobId: string } } };
  await t.s.jobs.settled(res.result.data.jobId);
  expect(t.s.apps.get(APP)!.state).toBe('running');
  const project = t.s.apps.project(APP).name;
  const service = t.s.apps.services(APP)[0]!;
  let clock = 1_000_000;
  /** One look by the watch, `after` ms after the last. */
  const look = async (after = 10_000) => t.s.appWatch.check((clock += after));
  const set = (patch: Parameters<typeof t.engine.setService>[2]) => t.engine.setService(project, service, patch);
  const state = () => t.s.apps.get(APP)!.state;
  const detail = () => JSON.parse(t.s.apps.get(APP)!.stateDetail ?? 'null') as Record<string, unknown> | null;
  const told = (kind = CRASHED_KIND) => t.s.db.select().from(notifications).where(eq(notifications.kind, kind)).all();
  const events: string[] = [];
  t.s.bus.on(({ event }) => {
    if (event.type === 'app.stateChanged' && event.data.appId === APP) events.push(event.data.state);
  });
  return { ...t, service, look, set, state, detail, told, events };
}

describe('US-APP-26', () => {
  it('a container down for 30 s puts the app in error and tells the admins "<App> stopped working"', async () => {
    const t = await running();
    t.set({ state: 'exited', exitCode: 1, startedAt: null });
    await t.look();
    await t.look();
    await t.look();
    expect(t.state()).toBe('running'); // 20 s down so far
    await t.look();
    expect(t.state()).toBe('error');
    expect(t.events).toEqual(['error']);
    expect(t.detail()).toEqual({ code: 'APP_CRASHED', service: t.service, exitCode: 1, oom: false, loop: false });
    const [n, ...more] = t.told();
    expect(more).toEqual([]);
    expect(n).toMatchObject({
      userId: null,
      target: APP,
      severity: 'warning',
      title: 'Uptime Kuma stopped working',
      body: 'It quit unexpectedly.',
      readAt: null,
    });
    expect(n!.actionJson).toEqual([
      { kind: 'mutation', procedure: 'apps.restart', input: { appId: APP }, label: 'Restart' },
      { kind: 'navigate', to: `/apps/${APP}/logs` },
    ]);
  });

  it('a blip Docker fixes by itself within 30 s is left alone', async () => {
    const t = await running();
    t.set({ state: 'restarting', exitCode: 1 });
    await t.look();
    await t.look();
    t.set({ state: 'running', exitCode: null, restartCount: 1 });
    await t.look(5_000);
    await t.look(60_000);
    expect(t.state()).toBe('running');
    expect(t.told()).toEqual([]);
  });

  it('3 restarts by Docker within 5 minutes is a crash loop, said as such', async () => {
    const t = await running();
    await t.look(); // the restart count as it was
    for (const count of [1, 2, 3]) {
      t.set({ state: 'running', restartCount: count });
      await t.look(60_000);
    }
    expect(t.state()).toBe('error');
    expect(t.detail()).toMatchObject({ code: 'APP_CRASHED', loop: true });
    expect(t.told()[0]!.body).toBe('It quit unexpectedly 3 times in 5 minutes.');
  });

  it('restarts spread over more than 5 minutes are not a loop', async () => {
    const t = await running();
    await t.look();
    for (const count of [1, 2, 3]) {
      t.set({ state: 'running', restartCount: count });
      await t.look(3 * 60_000);
    }
    expect(t.state()).toBe('running');
  });

  it('unhealthy for 60 s: it stopped answering', async () => {
    const t = await running();
    t.set({ health: 'unhealthy' });
    await t.look();
    await t.look(50_000);
    expect(t.state()).toBe('running');
    await t.look();
    expect(t.state()).toBe('error');
    expect(t.detail()).toEqual({ code: 'APP_UNHEALTHY', service: t.service });
    expect(t.told()[0]!.body).toBe('It stopped answering.');
  });

  it('killed for using too much memory: it ran out of memory', async () => {
    const t = await running();
    t.set({ state: 'exited', exitCode: 137, oomKilled: true });
    await t.look();
    await t.look(30_000);
    expect(t.detail()).toMatchObject({ code: 'APP_CRASHED', exitCode: 137, oom: true });
    expect(t.told()[0]!.body).toBe('It ran out of memory.');
  });

  it("exits hlabs causes don't count: an app stopping, restarting or updating isn't watched", async () => {
    const t = await running();
    t.s.apps.transition(APP, 'stopping');
    t.set({ state: 'exited', exitCode: 0 });
    await t.look();
    await t.look(60_000);
    expect(t.state()).toBe('stopping');
    t.s.apps.transition(APP, 'stopped');
    t.s.apps.transition(APP, 'starting');
    t.s.apps.transition(APP, 'running');
    t.s.apps.transition(APP, 'restarting');
    await t.look();
    await t.look(60_000);
    expect(t.state()).toBe('restarting');
    expect(t.told()).toEqual([]);
  });

  it('nothing is judged while the engine is away', async () => {
    const t = await running();
    t.engine.running = false;
    t.set({ state: 'exited', exitCode: 255 });
    await t.look();
    await t.look(60_000);
    expect(t.state()).toBe('running');
  });

  it('an app with no compose project (a dev stand-in) is left alone', async () => {
    const t = await running();
    rmSync(join(t.s.apps.project(APP).dir, MANIFEST_COPY));
    t.set({ state: 'exited', exitCode: 1 });
    await t.look();
    await t.look(60_000);
    expect(t.state()).toBe('running');
  });

  it('one notification per crash: read once the app runs again, so the next crash is told too', async () => {
    const t = await running();
    t.set({ state: 'exited', exitCode: 1 });
    await t.look();
    await t.look(30_000);
    expect(t.state()).toBe('error');
    await t.look(60_000);
    expect(t.told()).toHaveLength(1);
    // Restarted from the toast: the notification is read, and its toast goes.
    t.s.apps.transition(APP, 'starting');
    t.s.apps.transition(APP, 'running');
    expect(t.told()[0]!.readAt).not.toBeNull();
    // It falls over again: told again.
    await t.look();
    await t.look(30_000);
    expect(t.state()).toBe('error');
    expect(t.told().map((n) => n.readAt === null)).toEqual([false, true]);
  });

  it('uninstalling a broken app marks its notification read, so a reinstall starts clean', async () => {
    const t = await running();
    t.set({ state: 'exited', exitCode: 1 });
    await t.look();
    await t.look(30_000);
    expect(t.state()).toBe('error');
    t.s.apps.transition(APP, 'uninstalling');
    expect(t.told()[0]!.readAt).not.toBeNull();
  });

  it('only admins are told: the notification is for all admins, never a member', async () => {
    const t = await running();
    t.set({ state: 'exited', exitCode: 1 });
    await t.look();
    await t.look(30_000);
    expect(t.s.notifications.list({ userId: 'someone', role: 'member' }, {}).items).toEqual([]);
    expect(t.s.notifications.list({ userId: 'someone', role: 'admin' }, {}).items).toHaveLength(1);
  });

  it('back by itself and healthy for 60 s: running again, the notification read and "<App> is working again"', async () => {
    const t = await running();
    t.set({ state: 'exited', exitCode: 1 });
    await t.look();
    await t.look(30_000);
    expect(t.state()).toBe('error');
    t.set({ state: 'running', exitCode: null, health: 'starting' });
    await t.look();
    t.set({ health: 'healthy' });
    await t.look();
    await t.look(50_000);
    expect(t.state()).toBe('error');
    await t.look();
    expect(t.state()).toBe('running');
    expect(t.events).toEqual(['error', 'running']);
    expect(t.told()[0]!.readAt).not.toBeNull();
    expect(t.told(RECOVERED_KIND)).toEqual([
      expect.objectContaining({
        userId: null,
        target: APP,
        severity: 'success',
        title: 'Uptime Kuma is working again',
      }),
    ]);
  });

  it('an app in error for another reason (it never started) does not come back by itself', async () => {
    const t = await running();
    t.s.apps.transition(APP, 'restarting');
    t.s.apps.transition(APP, 'error', JSON.stringify({ code: 'APP_HEALTH_TIMEOUT', seconds: 120 }));
    await t.look();
    await t.look(120_000);
    expect(t.state()).toBe('error');
  });
});
