// Phase 4 · Done when #1, the automated part: tray.status shows the right state through an engine stop and a daemon
// restart (the tray's own side, health and icon, is tested in apps/tray: health.rs, us-state-07, us-inst-14). The
// update leg comes with the updating state (US-STATE-01) in step 5; the live check on a Mac is manual.
import { getSetting, setSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { shutdown } from '../src/boot';
import { trayStatus } from '../src/tray/status';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: { jobId: string } } };

describe('Phase 4 · the tray shows the right state through an engine stop and a daemon restart', () => {
  it('running → engine stopped → starting → running, then restart → starting → running', async () => {
    const t = await installDaemon(closers);
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId);
    setSetting(t.s.db, 'onboarding', { ...getSetting(t.s.db, 'onboarding'), completedAt: Date.now() });
    await t.s.reconciled;
    expect(await trayStatus(t.s)).toMatchObject({ state: 'running', appsRunning: 1, appsExpected: 1 });

    // The engine stops, taking the app's containers with it.
    for (const containers of t.engine.containers.values()) for (const c of containers) c.state = 'exited';
    t.engine.running = false;
    await t.s.engine.check();
    expect(await trayStatus(t.s)).toMatchObject({ state: 'engineStopped', engine: { running: false } });

    // Started again from the tray: Starting while the app comes back, then Running.
    t.engine.running = true;
    const start = t.s.jobs.start('engine_start', { payload: { userId: null, via: 'tray' } });
    await t.s.jobs.settled(start);
    expect(await trayStatus(t.s)).toMatchObject({ state: 'running', appsRunning: 1 });

    // The daemon restarts (the computer rebooted: containers down). Starting while it reconciles, then Running.
    await shutdown(t.s);
    for (const containers of t.engine.containers.values()) for (const c of containers) c.state = 'exited';
    const s2 = (await t.d.boot())!;
    expect((await trayStatus(s2)).state).toBe('starting');
    await s2.reconciled;
    expect(await trayStatus(s2)).toMatchObject({ state: 'running', appsRunning: 1, appsExpected: 1 });
  });
});
