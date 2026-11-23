// US-APP-18 · Network access: an app starts with the access its manifest asks for (`internet`: both on; `lan`: no
// internet; `none`: neither). apps.setPermissions turns "Reach the internet" and "Talk to other apps" on or off with
// one restart, the stack taken down first so its networks are made again: without the internet its networks are
// internal and the pinned socat sidecar publishes its web port, so Caddy still reaches it (D-049, D-165); without
// other apps its web service leaves the shared `hlabs` network. Folders and network apply together, and are undone
// together when the app isn't healthy.
import { appMounts } from '@hlabs/db';
import { parse } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { FORWARD_IMAGE, FORWARD_SERVICE } from '@hlabs/app-manifest';
import { settingsApp } from './config-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Compose = {
  services: Record<string, { ports?: string[]; networks?: unknown; image: string }>;
  networks: Record<string, Record<string, unknown>>;
};
const networksOf = (svc: { networks?: unknown }) =>
  Array.isArray(svc.networks) ? (svc.networks as string[]) : Object.keys((svc.networks as object) ?? {});

describe('US-APP-18', () => {
  it('starts with both on for `network: internet`', async () => {
    const t = await settingsApp(closers);
    expect(t.row()).toMatchObject({ netInternet: true, netApps: true });
    expect(((await t.config()) as { network: unknown }).network).toEqual({
      internet: true,
      apps: true,
      internetReason: null,
    });
  });

  it('`network: lan` starts with the internet on for now: an internal network would cut the home network too (Q-23)', async () => {
    const t = await settingsApp(closers, { permissions: '{ network: lan, internetReason: Needed for website icons }' });
    expect(t.row()).toMatchObject({ netInternet: true, netApps: true, state: 'running' });
    expect(((await t.config()) as { network: unknown }).network).toEqual({
      internet: true,
      apps: true,
      internetReason: 'Needed for website icons',
    });
    const compose = parse(t.file('docker-compose.yml')) as Compose;
    expect(compose.networks.default).not.toEqual({ internal: true });
    expect(compose.services[FORWARD_SERVICE]).toBeUndefined();
  });

  it('`network: none` starts with both off', async () => {
    const t = await settingsApp(closers, { permissions: '{ network: none }' });
    expect(t.row()).toMatchObject({ netInternet: false, netApps: false });
  });

  it('"Reach the internet" off: internal networks, the sidecar publishes the port, one restart', async () => {
    const t = await settingsApp(closers);
    const before = t.compose.calls.length;
    const { job } = await t.save('apps.setPermissions', { mounts: [], network: { internet: false, apps: true } });
    expect(job?.state).toBe('succeeded');
    expect(t.row()).toMatchObject({ netInternet: false, netApps: true, state: 'running' });
    // Taken down so its networks are made again, then up once.
    expect(t.compose.calls.slice(before).map((c) => c.op)).toEqual(['down', 'up']);
    const compose = parse(t.file('docker-compose.yml')) as Compose;
    expect(compose.networks.default).toEqual({ internal: true });
    expect(compose.services.vaultwarden!.ports).toBeUndefined();
    expect(networksOf(compose.services.vaultwarden!)).not.toContain('hlabs');
    expect(compose.services[FORWARD_SERVICE]).toMatchObject({ image: FORWARD_IMAGE });
    expect(compose.services[FORWARD_SERVICE]!.ports).toEqual([`127.0.0.1:${t.row().portFallback! + 1000}:80`]);
    // compose runs with --pull never: hlabs pulled the sidecar's image.
    expect(t.engine.pulls).toContain(FORWARD_IMAGE);
    // The sidecar isn't one of the app's containers in Logs.
    expect(t.s.apps.services('vaultwarden')).toEqual(['vaultwarden']);
    expect(t.audits('app.setPermissions')[0]!.detailJson).toMatchObject({
      network: { from: { internet: true, apps: true }, to: { internet: false, apps: true } },
    });
  });

  it('"Talk to other apps" off: the web service leaves the shared network', async () => {
    const t = await settingsApp(closers);
    await t.save('apps.setPermissions', { mounts: [], network: { internet: true, apps: false } });
    const compose = parse(t.file('docker-compose.yml')) as Compose;
    expect(networksOf(compose.services.vaultwarden!)).not.toContain('hlabs');
    expect(compose.services.vaultwarden!.ports).toEqual([`127.0.0.1:${t.row().portFallback! + 1000}:80`]);
    expect(compose.services[FORWARD_SERVICE]).toBeUndefined();
  });

  it('folders and network go back together when the app is not healthy', async () => {
    const t = await settingsApp(closers);
    const compose = t.file('docker-compose.yml');
    t.setHttp(() => (t.file('docker-compose.yml').includes(FORWARD_SERVICE) ? null : 200));
    const { job } = await t.save('apps.setPermissions', {
      mounts: [{ target: '/mnt/hlabs/Backups', storageLocationId: 'root', subpath: 'shared/Backups', mode: 'rw' }],
      network: { internet: false, apps: false },
    });
    expect(job).toMatchObject({ state: 'failed', hlabsCode: 'APP_CONFIG_UNDONE' });
    expect(t.row()).toMatchObject({ netInternet: true, netApps: true, state: 'running' });
    expect(t.s.db.select().from(appMounts).all()).toEqual([]);
    expect(t.file('docker-compose.yml')).toBe(compose);
  });
});
