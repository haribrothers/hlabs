// US-STORE-05 · Search results with filters (server side): matches name, id, tagline, tags and description, ignoring
// case and accents, with name matches first; the chips' counts; "Installed" and "Apple Silicon only"; queries are
// trimmed and capped at 100 characters, and one character filters nothing.
import { apps, openDb } from '@hlabs/db';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { CatalogService } from '../src/store/catalog';
import { StoreService } from '../src/store/service';
import { tempDir } from './helpers';
import { storeFixture } from './store-fixture';

function service(opts: { amd64Only?: string[]; installed?: string[] } = {}) {
  const fixture = storeFixture({ amd64Only: opts.amd64Only });
  // Vaultwarden's description mentions photos; Uptime Kuma's tagline has an accent.
  const vault = join(fixture, 'apps', 'vaultwarden', 'hlabs-app.yml');
  writeFileSync(
    vault,
    readFileSync(vault, 'utf8').replace(/^description: .*$/m, 'description: Also keeps notes about photo albums.'),
  );
  const kuma = join(fixture, 'apps', 'uptime-kuma', 'hlabs-app.yml');
  writeFileSync(kuma, readFileSync(kuma, 'utf8').replace(/^tagline: .*$/m, 'tagline: Watch every café website'));
  const db = openDb({ dataDir: tempDir() });
  for (const id of opts.installed ?? [])
    db.insert(apps)
      .values({ id, version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 } as never)
      .run();
  const catalog = new CatalogService(db, fixture, silentLogger());
  catalog.syncBuiltin();
  return new StoreService(db, catalog, { os: 'macos', arm64: true });
}

const ids = (r: { items: Array<{ id: string }> }) => r.items.map((a) => a.id);

describe('US-STORE-05', () => {
  it('name matches come before description matches', () => {
    const store = service();
    expect(ids(store.listApps({ query: 'photo' }))).toEqual(['immich', 'vaultwarden']);
  });

  it('matches the id, the tagline and tags, ignoring case and accents', () => {
    const store = service();
    expect(ids(store.listApps({ query: 'UPTIME-KUMA' }))).toEqual(['uptime-kuma']);
    expect(ids(store.listApps({ query: 'cafe' }))).toEqual(['uptime-kuma']);
    expect(ids(store.listApps({ query: 'local-ai' }))).toEqual(['immich']);
  });

  it('counts all results and the installed ones; "Installed" keeps only those', () => {
    const store = service({ installed: ['vaultwarden'] });
    const all = store.listApps({ query: 'photo' });
    expect(all.counts).toEqual({ all: 2, installed: 1 });
    const installed = store.listApps({ query: 'photo', installedOnly: true });
    expect(ids(installed)).toEqual(['vaultwarden']);
    expect(installed.counts).toEqual({ all: 2, installed: 1 });
  });

  it('"Apple Silicon only" leaves out apps without an arm64 image, in the counts too', () => {
    const store = service({ amd64Only: ['immich'] });
    const r = store.listApps({ query: 'photo', arm64Only: true });
    expect(ids(r)).toEqual(['vaultwarden']);
    expect(r.counts.all).toBe(1);
  });

  it('trims the query, caps it at 100 characters and filters nothing with one character', () => {
    const store = service();
    expect(ids(store.listApps({ query: '  photo  ' }))).toEqual(['immich', 'vaultwarden']);
    expect(store.listApps({ query: 'p' }).items).toHaveLength(3);
    expect(store.listApps({ query: `photo${'x'.repeat(100)}` }).items).toEqual([]);
    expect(ids(store.listApps({ query: `${'photo'.padEnd(100, ' ')}zzz` }))).toEqual(['immich', 'vaultwarden']);
  });
});
