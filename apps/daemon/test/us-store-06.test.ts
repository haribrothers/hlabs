// US-STORE-06 · See an app's details before installing: store.getApp.
import { hlabsCodeOf } from '@hlabs/api';
import { openDb, setSetting } from '@hlabs/db';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { CatalogService } from '../src/store/catalog';
import { serviceRole, StoreService } from '../src/store/service';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';
import { storeFixture } from './store-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function service(fixture = storeFixture()) {
  const db = openDb({ dataDir: tempDir() });
  const catalog = new CatalogService(db, fixture, silentLogger());
  catalog.syncBuiltin();
  return { db, store: new StoreService(db, catalog, { os: 'macos', arm64: true }) };
}

describe('US-STORE-06', () => {
  it('has what the details page shows: the app, its official source, version, services, address and folders', async () => {
    const { store } = service();
    const d = await store.getApp('immich');
    expect(d.app).toMatchObject({ id: 'immich', name: 'Immich', group: 'files', arm64: true });
    expect(d.source).toEqual({ id: 'builtin', name: 'hlabs', official: true });
    expect(d.version).toBe('3.2.2');
    expect(d.description).toMatch(/photo and video backup/);
    expect(d.address).toBe('immich.hlabs.local');
    expect(d.services.map((s) => s.role)).toEqual(expect.arrayContaining(['server', 'database', 'cache']));
    expect(d.services.find((s) => s.role === 'server')?.name).toBe('immich-server');
    expect(d.folders).toEqual([
      expect.objectContaining({ key: 'library', label: 'Photo library', mode: 'rw', required: true }),
      ...d.folders.slice(1),
    ]);
    expect(d.readme).toBeNull();
    expect(d.screenshots).toEqual([
      '/api/store/apps/builtin/immich/assets/screenshots/1.webp',
      '/api/store/apps/builtin/immich/assets/screenshots/2.webp',
      '/api/store/apps/builtin/immich/assets/screenshots/3.webp',
    ]);
  });

  it('the address uses this hlabs’s name', async () => {
    const { db, store } = service();
    setSetting(db, 'hostname', 'home');
    expect((await store.getApp('vaultwarden')).address).toBe('vaultwarden.home.local');
  });

  it('includes the README and the screenshots in name order (store:lint allows at most 5)', async () => {
    const fixture = storeFixture();
    const dir = join(fixture, 'apps', 'vaultwarden');
    writeFileSync(join(dir, 'README.md'), '# Vaultwarden\n\nMore about it.');
    rmSync(join(dir, 'screenshots'), { recursive: true, force: true });
    mkdirSync(join(dir, 'screenshots'));
    for (const f of ['10.webp', '2.webp', '1.png', '3.jpg']) writeFileSync(join(dir, 'screenshots', f), 'x');
    const d = await service(fixture).store.getApp('vaultwarden');
    expect(d.readme).toBe('# Vaultwarden\n\nMore about it.');
    expect(d.screenshots).toEqual(
      ['1.png', '2.webp', '3.jpg', '10.webp'].map((f) => `/api/store/apps/builtin/vaultwarden/assets/screenshots/${f}`),
    );
  });

  it('names service roles from the web service and well-known images', () => {
    expect(serviceRole('web', 'x/app:1', 'web')).toBe('server');
    expect(serviceRole('db', 'ghcr.io/immich-app/postgres:14@sha256:abc', 'web')).toBe('database');
    expect(serviceRole('db', 'mariadb:11', 'web')).toBe('database');
    expect(serviceRole('redis', 'docker.io/valkey/valkey:8', 'web')).toBe('cache');
    expect(serviceRole('ml', 'ghcr.io/immich-app/immich-machine-learning:v1', 'web')).toBeNull();
  });

  it('an app that isn’t in the store is NOT_FOUND', async () => {
    const { store } = service();
    await expect(store.getApp('nextcloud')).rejects.toSatisfy((e) => hlabsCodeOf(e) === 'NOT_FOUND');
  });

  it('is served as store.getApp, with the store’s member rule', async () => {
    const d = await daemonWithAdmin(closers, {
      resources: { storeDir: storeFixture(), binDir: '/none', webFallbackDir: '/none' },
    } as never);
    const res = await fetch(
      `${d.url}/trpc/store.getApp?input=${encodeURIComponent(JSON.stringify({ appId: 'immich' }))}`,
      {
        headers: { cookie: d.cookie },
      },
    );
    expect(((await res.json()) as { result: { data: { app: { name: string } } } }).result.data.app.name).toBe('Immich');
  });
});
