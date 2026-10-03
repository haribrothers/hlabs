// Phase 4 · Done when #1, the automated part: tray.status shows the right state through an engine stop, a daemon
// restart and an update (the tray's own side, health and icon, is tested in apps/tray: health.rs, us-state-07,
// us-inst-14, us-inst-20). The live check on a Mac, and the signed update (Done when #2), are manual.
import type { HlabsEvent } from '@hlabs/api';
import { getSetting, jobs as jobsTable, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shutdown } from '../src/boot';
import { trayStatus } from '../src/tray/status';
import { startSystemUpdate } from '../src/updates/install';
import { UPDATE_MARKER } from '../src/updates/marker';
import { FakeUpdateSource } from './fakes/update-source';
import { startDaemon, testConfig } from './helpers';
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

  it('an update: requested → the tray applies it (the daemon stops) → updating steps 2–4 → running on the new version', async () => {
    const source = new FakeUpdateSource();
    source.releases.stable = { version: '1.5.0' };
    const config = testConfig({ version: '1.4.0' });
    const d1 = await startDaemon({ config, boot: { updateSource: source } });
    closers.push(d1.close);
    const events: HlabsEvent[] = [];
    d1.services!.bus.on((e) => events.push(e.event));
    await d1.services!.hlabsUpdates.check();
    const { jobId } = startSystemUpdate(d1.services!.systemUpdate, null);
    expect(await trayStatus(d1.services!)).toMatchObject({
      state: 'running',
      updateRequested: { jobId, version: '1.5.0' },
    });
    expect(events.map((e) => e.type)).toContain('update.applyRequested');

    // The tray writes its marker, stops the daemon and replaces hlabs.
    writeFileSync(
      join(config.paths.dataDir, UPDATE_MARKER),
      JSON.stringify({ fromVersion: '1.4.0', toVersion: '1.5.0', startedAt: Date.now() }),
    );
    await d1.close();
    closers.splice(closers.indexOf(d1.close), 1);

    // hlabs 1.5.0 starts: "updating" through its steps (the tray shows it as updating), then running.
    const d2 = await startDaemon({
      config: { ...config, version: '1.5.0' },
      skipBoot: true,
      boot: { updateSource: source },
    });
    closers.push(d2.close);
    const said: unknown[] = [];
    const updating = d2.readiness.updating.bind(d2.readiness);
    d2.readiness.updating = (step: number) => {
      updating(step);
      said.push(d2.readiness.unavailable());
    };
    const s2 = (await d2.boot())!;
    closers.push(() => shutdown(s2));
    expect(said.map((x) => (x as { step: number; reason: string }).reason + (x as { step: number }).step)).toEqual([
      'updating2',
      'updating3',
      'updating4',
    ]);
    expect(await trayStatus(s2)).toMatchObject({ state: 'running', updateRequested: null });
    expect(s2.db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).get()?.state).toBe('succeeded');
  });
});
