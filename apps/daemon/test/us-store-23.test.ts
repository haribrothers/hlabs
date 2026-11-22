// US-STORE-23 · Find the apps people run on a home server (daemon): an app drafted from Runtipi or CasaOS is credited
// from its NOTICE; every app in the built-in store loads cleanly, in a store group, and is one of the approved apps in
// store/APPS.md (D-161).
import { loadAppDir, listAppDirs } from '@hlabs/app-manifest/node';
import { openDb } from '@hlabs/db';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { CatalogService } from '../src/store/catalog';
import { StoreService } from '../src/store/service';
import { tempDir } from './helpers';
import { storeFixture } from './store-fixture';

const REPO_STORE = resolve(import.meta.dirname, '../../../store');

function service(fixture: string) {
  const db = openDb({ dataDir: tempDir() });
  const catalog = new CatalogService(db, fixture, silentLogger());
  catalog.syncBuiltin();
  return new StoreService(db, catalog, { os: 'macos', arm64: true });
}

describe('US-STORE-23', () => {
  it('an app drafted from Runtipi is credited with its licence; one written for hlabs is not', async () => {
    const store = service(storeFixture({ apps: ['immich', 'sonarr'] }));
    expect((await store.getApp('sonarr')).packagedFrom).toEqual({ store: 'Runtipi', license: 'GPL-3.0' });
    expect((await store.getApp('immich')).packagedFrom).toBeNull();
  });

  it('a CasaOS NOTICE is read the same way', async () => {
    const dir = storeFixture({ apps: ['sonarr'] });
    writeFileSync(
      join(dir, 'apps', 'sonarr', 'NOTICE'),
      'Drafted from the CasaOS app store.\n\nSource: https://example.com\nLicence: Apache License 2.0 (Apache-2.0).\n',
    );
    expect((await service(dir).getApp('sonarr')).packagedFrom).toEqual({ store: 'CasaOS', license: 'Apache-2.0' });
  });

  it('an app without an arm64 image is marked so on an arm64 computer', async () => {
    const store = service(storeFixture({ apps: ['sonarr'], amd64Only: ['sonarr'] }));
    expect((await store.getApp('sonarr')).app.arm64).toBe(false);
  });

  it('every built-in app loads without problems, in a store group, and is on the approved list', () => {
    const approved = new Set(
      [...readFileSync(join(REPO_STORE, 'APPS.md'), 'utf8').matchAll(/^\| [^|]+? \(`([a-z0-9-]+)`\)\s*\|/gm)].map(
        (m) => m[1],
      ),
    );
    expect(approved.size).toBe(100);
    for (const dir of listAppDirs(REPO_STORE)) {
      const app = loadAppDir(dir, { requireDigest: true });
      expect(app.issues, basename(dir)).toEqual([]);
      expect(approved.has(basename(dir)), `${basename(dir)} is in store/APPS.md`).toBe(true);
    }
  });
});
