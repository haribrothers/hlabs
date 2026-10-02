// US-INST-05 · See status at a glance: tray.status gives the tray hlabs's state, the running apps, CPU, memory, free
// space and the dashboard's address.
import { apps, setSetting, setUserSetting, users } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { dashboardUrl } from '../src/tray/status';
import { FakeHostStats } from './fakes/host-stats';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();

async function status(url: string) {
  const res = await fetch(`${url}/trpc/tray.status`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const body = (await res.json()) as { result?: { data: Record<string, unknown> }; error?: unknown };
  if (!body.result) throw new Error(JSON.stringify(body.error));
  return body.result.data;
}

function app(id: string, state: string, autostart = true) {
  return { id, version: '1', state, hostname: id, autostart, installedAt: 1, updatedAt: 1 } as never;
}

describe('US-INST-05 · See status at a glance', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function daemon(host = new FakeHostStats()) {
    const d = await startDaemon({
      config: { devAnonymousAdmin: false },
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
      boot: { host },
    });
    close = d.close;
    await d.services!.reconciled;
    return d;
  }

  it('reports running with the number of running apps, CPU, memory and free space', async () => {
    const d = await daemon(new FakeHostStats(18.4, 9.4e9));
    d.services!.db.insert(apps)
      .values([app('immich', 'running'), app('jellyfin', 'running'), app('paperless', 'stopped', false)])
      .run();
    const s = await status(d.url);
    expect(s).toMatchObject({
      state: 'running',
      appsRunning: 2,
      appsExpected: 2,
      paused: false,
      cpuPercent: 18.4,
      memoryUsedBytes: 9.4e9,
      freeBytes: 142e9,
      engine: { name: 'orbstack', running: true, managedByHlabs: false },
    });
  });

  it('counts an app that should run but is not running as expected, not running', async () => {
    const d = await daemon();
    d.services!.db.insert(apps)
      .values([app('immich', 'running'), app('jellyfin', 'error')])
      .run();
    expect(await status(d.url)).toMatchObject({ appsRunning: 1, appsExpected: 2 });
  });

  it('says when the container engine has stopped', async () => {
    const d = await daemon();
    d.engine.running = false;
    await d.services!.engine.check();
    expect(await status(d.url)).toMatchObject({ state: 'engineStopped', engine: { running: false } });
  });

  it('gives null, never zero, for a reading it could not take', async () => {
    const d = await daemon(new FakeHostStats(null, null));
    expect(await status(d.url)).toMatchObject({ cpuPercent: null, memoryUsedBytes: null });
  });

  it("carries the update channel, onboarding and the first admin's Reduce transparency", async () => {
    const d = await daemon();
    const { db } = d.services!;
    setSetting(db, 'updates', { channel: 'beta', autoHlabs: false, autoApps: false, backupBeforeUpdate: true });
    db.insert(users)
      .values({
        id: 'u1',
        username: 'hari',
        displayName: 'Hari',
        role: 'admin',
        passwordHash: 'x',
        createdAt: 1,
      } as never)
      .run();
    setUserSetting(db, 'appearance', 'u1', { reduceTransparency: true } as never);
    await d.services!.onboarding.markComplete();
    expect(await status(d.url)).toMatchObject({
      updateChannel: 'beta',
      autoUpdate: false,
      onboardingComplete: true,
      reduceTransparency: true,
      exclusiveJobRunning: false,
      backup: { configured: false, lastSucceededAt: null, running: false, lastFailed: false },
    });
  });

  it("uses the current dashboard address: the .local name, or the LAN address while it can't be published", () => {
    const config = { proxy: 'caddy', dashboardUrl: 'http://127.0.0.1:7474' } as never;
    const home = (published: boolean, fallbackAddress: string | null) =>
      ({ homeNetwork: () => ({ published, localAddress: 'https://den.local', fallbackAddress }) }) as never;
    expect(dashboardUrl({ config, routing: home(true, null) })).toBe('https://den.local');
    expect(dashboardUrl({ config, routing: home(false, 'https://192.168.1.40') })).toBe('https://192.168.1.40');
    // Without Caddy (development) it's the configured address.
    expect(
      dashboardUrl({
        config: { proxy: 'none', dashboardUrl: 'http://127.0.0.1:5173' } as never,
        routing: home(true, null),
      }),
    ).toBe('http://127.0.0.1:5173');
  });
});
