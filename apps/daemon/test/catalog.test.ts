// The built-in store is loaded into catalog_apps at start (04 §Apps: a cache, rebuilt on sync).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appSources, catalogApps, openDb } from '@hlabs/db';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { BUILTIN_SOURCE_ID, CatalogService } from '../src/store/catalog';
import { tempDir } from './helpers';

const REPO_STORE = fileURLToPath(new URL('../../../store', import.meta.url));

function setup() {
  const dir = tempDir();
  const storeDir = join(dir, 'store');
  mkdirSync(join(storeDir, 'apps'), { recursive: true });
  const db = openDb({ dataDir: dir });
  return { db, storeDir, catalog: new CatalogService(db, storeDir, silentLogger()) };
}

function copyApp(storeDir: string, id: string) {
  cpSync(join(REPO_STORE, 'apps', id), join(storeDir, 'apps', id), { recursive: true });
}

describe('CatalogService.syncBuiltin', () => {
  it('creates the built-in source and one row per valid app', () => {
    const { db, storeDir, catalog } = setup();
    copyApp(storeDir, 'uptime-kuma');
    copyApp(storeDir, 'vaultwarden');
    const result = catalog.syncBuiltin(1000);
    expect(result.synced.sort()).toEqual(['uptime-kuma', 'vaultwarden']);
    expect(db.select().from(appSources).all()).toMatchObject([
      { id: BUILTIN_SOURCE_ID, kind: 'builtin', enabled: true, lastSyncedAt: 1000, lastError: null },
    ]);
    const rows = db.select().from(catalogApps).all();
    expect(rows.map((r) => r.appId).sort()).toEqual(['uptime-kuma', 'vaultwarden']);
    expect(rows[0]).toMatchObject({ firstSeenAt: 1000, updatedAt: 1000 });
  });

  it('keeps first_seen_at on a later sync and removes apps that left the store', () => {
    const { db, storeDir, catalog } = setup();
    copyApp(storeDir, 'uptime-kuma');
    copyApp(storeDir, 'vaultwarden');
    catalog.syncBuiltin(1000);
    rmSync(join(storeDir, 'apps', 'vaultwarden'), { recursive: true });
    catalog.syncBuiltin(2000);
    expect(db.select().from(catalogApps).all()).toMatchObject([
      { appId: 'uptime-kuma', firstSeenAt: 1000, updatedAt: 2000 },
    ]);
  });

  it('leaves out an app that fails validation and notes it on the source', () => {
    const { db, storeDir, catalog } = setup();
    copyApp(storeDir, 'uptime-kuma');
    mkdirSync(join(storeDir, 'apps', 'broken'));
    writeFileSync(join(storeDir, 'apps', 'broken', 'hlabs-app.yml'), 'schema: 1\nid: broken\n');
    const result = catalog.syncBuiltin();
    expect(result.synced).toEqual(['uptime-kuma']);
    expect(result.skipped).toHaveLength(1);
    expect(db.select().from(appSources).get()?.lastError).toBe('1 app(s) failed validation');
  });

  it('get() returns the manifest and compose file to install from', () => {
    const { storeDir, catalog } = setup();
    copyApp(storeDir, 'uptime-kuma');
    catalog.syncBuiltin();
    const app = catalog.get('uptime-kuma');
    expect(app?.manifest).toMatchObject({ id: 'uptime-kuma', web: { service: 'uptime-kuma', port: 3001 } });
    expect(Object.keys(app!.compose.services)).toEqual(['uptime-kuma']);
    expect(catalog.get('nextcloud')).toBeNull();
  });

  it('loads every app in the repository store', () => {
    const { db } = setup();
    const catalog = new CatalogService(db, REPO_STORE, silentLogger());
    expect(catalog.syncBuiltin().skipped).toEqual([]);
  });
});
