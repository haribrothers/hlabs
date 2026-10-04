// US-STATE-01 · Show a full-screen updating state (server side): a daemon starting after the tray replaced hlabs
// (update-state.json there) reports `updating` with steps 2–4 through /healthz until ready, then removes the marker.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { shutdown } from '../src/boot';
import { Readiness, UPDATE_STEPS } from '../src/readiness';
import { UPDATE_MARKER } from '../src/updates/marker';
import { startDaemon, testConfig } from './helpers';

describe('US-STATE-01 · Show a full-screen updating state', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('the four steps are Installing update, Restarting apps, Checking apps and Finishing up', () => {
    expect(UPDATE_STEPS).toEqual(['Installing update', 'Restarting apps', 'Checking apps', 'Finishing up']);
    const r = new Readiness();
    r.updating(3);
    expect(r.unavailable()).toEqual({ reason: 'updating', step: 3, steps: 4, stepLabel: 'Checking apps' });
    r.ready();
    expect(r.unavailable()).toBeNull();
  });

  it('a start after an update says "updating" (not "starting") until ready, then removes the marker', async () => {
    const config = testConfig();
    const marker = join(config.paths.dataDir, UPDATE_MARKER);
    writeFileSync(marker, JSON.stringify({ fromVersion: '1.4.0', toVersion: '0.0.0-test', startedAt: 1 }));
    const d = await startDaemon({ config, skipBoot: true });
    close = d.close;
    // What /healthz would say at each step of this start.
    const said: unknown[] = [];
    const updating = d.readiness.updating.bind(d.readiness);
    d.readiness.updating = (step: number) => {
      updating(step);
      said.push(d.readiness.unavailable());
    };
    const services = await d.boot();
    close = async () => {
      await d.close();
      await shutdown(services);
    };
    expect(said).toEqual([
      { reason: 'updating', step: 2, steps: 4, stepLabel: 'Restarting apps' },
      { reason: 'updating', step: 3, steps: 4, stepLabel: 'Checking apps' },
      { reason: 'updating', step: 4, steps: 4, stepLabel: 'Finishing up' },
    ]);
    expect((await fetch(`${d.url}/healthz`)).status).toBe(200);
    expect(existsSync(marker)).toBe(false);
  });

  it('without a marker, starting is "starting" as before', async () => {
    const d = await startDaemon({ skipBoot: true });
    close = d.close;
    const body = (await (await fetch(`${d.url}/healthz`)).json()) as { reason: string };
    expect(body.reason).toBe('starting');
  });
});
