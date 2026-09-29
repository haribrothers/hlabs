// US-STORE-07 · See requirements and what an app can access: store.getApp's requirements, access and dependsOn.
import { apps, openDb } from '@hlabs/db';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { CatalogService } from '../src/store/catalog';
import { StoreService, type StoreResources } from '../src/store/service';
import { tempDir } from './helpers';
import { storeFixture } from './store-fixture';

const GiB = 2 ** 30;
const MiB = 2 ** 20;

function service(resources: StoreResources, fixture = storeFixture()) {
  const db = openDb({ dataDir: tempDir() });
  const catalog = new CatalogService(db, fixture, silentLogger());
  catalog.syncBuiltin();
  return { db, store: new StoreService(db, catalog, { os: 'linux', arm64: false }, resources) };
}

const resources = (memory: number | null, disk: number | null): StoreResources => ({
  engineMemoryBytes: () => memory,
  appDataFreeBytes: async () => disk,
});

/** Uptime Kuma with a raw DNS port, the GPU, Docker access and Vaultwarden as a dependency. */
function riskyFixture() {
  const dir = storeFixture();
  const manifest = join(dir, 'apps', 'uptime-kuma', 'hlabs-app.yml');
  let m = readFileSync(manifest, 'utf8').replace(
    'permissions: { network: internet }',
    'permissions: { network: lan, gpu: true, dockerSocket: true }',
  );
  m +=
    'ports:\n  - { service: uptime-kuma, container: 53, protocol: udp, host: 53, label: DNS }\ndependsOn: [vaultwarden]\n';
  writeFileSync(manifest, m);
  const compose = join(dir, 'apps', 'uptime-kuma', 'docker-compose.yml');
  writeFileSync(
    compose,
    readFileSync(compose, 'utf8').replace('    volumes:', "    ports: ['53:53/udp']\n    volumes:"),
  );
  return dir;
}

describe('US-STORE-07', () => {
  it('requirements in bytes, with the free memory (engine less what installed apps recommend) and free disk', async () => {
    const { db, store } = service(resources(8 * GiB, 50 * GiB));
    db.insert(apps)
      .values({
        id: 'vaultwarden',
        version: '1',
        state: 'running',
        hostname: 'vaultwarden',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    const d = await store.getApp('immich');
    const vaultwardenMemory = (await store.getApp('vaultwarden')).requirements.memoryBytes!;
    expect(d.requirements).toEqual({
      memoryBytes: 4096 * MiB,
      diskBytes: 10240 * MiB,
      memoryFreeBytes: 8 * GiB - vaultwardenMemory,
      diskFreeBytes: 50 * GiB,
    });
  });

  it('unmeasured (engine stopped) is null, so no warning is shown', async () => {
    const { store } = service(resources(null, null));
    expect((await store.getApp('immich')).requirements).toMatchObject({ memoryFreeBytes: null, diskFreeBytes: null });
  });

  it('access: network, raw ports, GPU and Docker from the manifest', async () => {
    const { store } = service(resources(null, null), riskyFixture());
    expect((await store.getApp('uptime-kuma')).access).toEqual({
      network: 'lan',
      ports: [{ label: 'DNS', host: 53, protocol: 'udp' }],
      gpu: true,
      dockerSocket: true,
    });
    expect((await store.getApp('immich')).access).toEqual({
      network: 'internet',
      ports: [],
      gpu: false,
      dockerSocket: false,
    });
  });

  it('dependsOn names each app and whether it is installed', async () => {
    const { db, store } = service(resources(null, null), riskyFixture());
    expect((await store.getApp('uptime-kuma')).dependsOn).toEqual([
      { appId: 'vaultwarden', name: 'Vaultwarden', installed: false },
    ]);
    db.insert(apps)
      .values({
        id: 'vaultwarden',
        version: '1',
        state: 'running',
        hostname: 'vaultwarden',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    expect((await store.getApp('uptime-kuma')).dependsOn[0]!.installed).toBe(true);
  });
});
