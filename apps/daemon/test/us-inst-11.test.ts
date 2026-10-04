// US-INST-11 · Starting state: tray.status says "starting" while apps are being brought up, counts them, names the app
// for "Show startup log" and the apps that need attention.
import { apps } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { trayStatus } from '../src/tray/status';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();

function app(id: string, state: string, autostart = true) {
  return { id, version: '1', state, hostname: id, autostart, installedAt: 1, updatedAt: 1 } as never;
}

describe('US-INST-11 · Starting state', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function daemon() {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    close = d.close;
    await d.services!.reconciled;
    return d;
  }

  it('is starting while the start-up reconcile runs, then running', async () => {
    const d = await daemon();
    let reconciling = true;
    const services = { ...d.services!, isReconciling: () => reconciling };
    expect((await trayStatus(services)).state).toBe('starting');
    reconciling = false;
    expect((await trayStatus(services)).state).toBe('running');
  });

  it('counts "4 of 11": running apps of those that should run, while one is still starting', async () => {
    const d = await daemon();
    const { db } = d.services!;
    db.insert(apps)
      .values([app('immich', 'running'), app('jellyfin', 'starting'), app('paperless', 'stopped', false)])
      .run();
    const s = await trayStatus(d.services!);
    expect(s).toMatchObject({ state: 'starting', appsRunning: 1, appsExpected: 2, startupLogAppId: 'jellyfin' });

    db.update(apps).set({ state: 'running' }).where(eq(apps.id, 'jellyfin')).run();
    expect(await trayStatus(d.services!)).toMatchObject({
      state: 'running',
      appsRunning: 2,
      appsExpected: 2,
      startupLogAppId: null,
    });
  });

  it('an app that ends in error leaves hlabs running with one app needing attention', async () => {
    const d = await daemon();
    d.services!.db.insert(apps)
      .values([app('immich', 'running'), app('jellyfin', 'error')])
      .run();
    expect(await trayStatus(d.services!)).toMatchObject({
      state: 'running',
      appsRunning: 1,
      appsExpected: 2,
      appsNeedAttention: 1,
      startupLogAppId: 'jellyfin',
    });
  });

  it('a stopped engine wins over starting', async () => {
    const d = await daemon();
    d.services!.db.insert(apps)
      .values([app('jellyfin', 'starting')])
      .run();
    d.engine.running = false;
    await d.services!.engine.check();
    expect((await trayStatus(d.services!)).state).toBe('engineStopped');
  });
});
