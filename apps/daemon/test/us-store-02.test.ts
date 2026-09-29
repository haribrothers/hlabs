// US-STORE-02 · Navigate with the categories sidebar: store.listCategories and a category's apps.
import { openDb } from '@hlabs/db';
import { categoryGroupOf, STORE_CATEGORY_GROUP_IDS } from '@hlabs/shared';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { CatalogService } from '../src/store/catalog';
import { StoreService } from '../src/store/service';
import { tempDir } from './helpers';
import { storeFixture } from './store-fixture';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function service(fixture: string) {
  const db = openDb({ dataDir: tempDir() });
  const catalog = new CatalogService(db, fixture, silentLogger());
  catalog.syncBuiltin();
  return new StoreService(db, catalog, { os: 'linux', arm64: false });
}

describe('US-STORE-02', () => {
  it('groups manifest categories: photos and files are "Files & photos"; the order is fixed', () => {
    expect(categoryGroupOf('photos')).toBe('files');
    expect(categoryGroupOf('files')).toBe('files');
    expect(categoryGroupOf('unknown')).toBe('other');
    expect(STORE_CATEGORY_GROUP_IDS.slice(0, 6)).toEqual(['media', 'files', 'network', 'home', 'developer', 'ai']);
  });

  it('lists only categories with apps, in the fixed order, with counts', () => {
    const fixture = storeFixture();
    // Make Uptime Kuma a media app, so Media (first in the order) has one.
    const kuma = join(fixture, 'apps', 'uptime-kuma', 'hlabs-app.yml');
    writeFileSync(kuma, readFileSync(kuma, 'utf8').replace('category: monitoring', 'category: media'));
    expect(service(fixture).listCategories()).toEqual({
      categories: [
        { id: 'media', count: 1 },
        { id: 'files', count: 1 },
        { id: 'security', count: 1 },
      ],
    });
  });

  it('a category lists its apps', () => {
    const store = service(storeFixture());
    expect(store.listApps({ category: 'files' }).items.map((a) => a.id)).toEqual(['immich']);
    expect(store.listApps({ category: 'media' }).items).toEqual([]);
  });
});
