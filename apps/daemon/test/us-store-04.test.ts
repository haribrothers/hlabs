// US-STORE-04 · Browse a category (server side): store.listApps with `sort` (Popular = the curated rank, New = first
// seen, A–Z), apps that run here first on arm64, a page of 50 at a time with a cursor, and the count; members only
// while "Members can install apps" is on.
import { catalogApps, openDb, setSetting, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { CatalogService } from '../src/store/catalog';
import { StoreService, type StoreHost } from '../src/store/service';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';
import { storeFixture } from './store-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** Every app in one category (security), so the sorts have something to order. */
const SECURITY = `featured: []
collections: []
rank: [uptime-kuma, immich]
`;

function service(host: StoreHost = { os: 'linux', arm64: false }, amd64Only: string[] = []) {
  const fixture = storeFixture({ curation: SECURITY, amd64Only });
  for (const id of ['immich', 'uptime-kuma']) {
    const file = join(fixture, 'apps', id, 'hlabs-app.yml');
    writeFileSync(file, readFileSync(file, 'utf8').replace(/^category: .*$/m, 'category: security'));
  }
  // A name in lower case: A–Z doesn't care.
  const vault = join(fixture, 'apps', 'vaultwarden', 'hlabs-app.yml');
  writeFileSync(vault, readFileSync(vault, 'utf8').replace(/^name: Vaultwarden$/m, 'name: bitwarden lite'));
  const db = openDb({ dataDir: tempDir() });
  const catalog = new CatalogService(db, fixture, silentLogger());
  catalog.syncBuiltin();
  const firstSeen = { immich: 1_000, 'uptime-kuma': 3_000, vaultwarden: 2_000 };
  for (const [appId, at] of Object.entries(firstSeen))
    db.update(catalogApps).set({ firstSeenAt: at }).where(eq(catalogApps.appId, appId)).run();
  return new StoreService(db, catalog, host);
}

const ids = (r: { items: Array<{ id: string }> }) => r.items.map((a) => a.id);

describe('US-STORE-04', () => {
  it('Popular follows the curated rank (unranked apps after, A–Z); New is newest first; A–Z ignores case', () => {
    const store = service();
    expect(ids(store.listApps({ category: 'security', sort: 'popular' }))).toEqual([
      'uptime-kuma',
      'immich',
      'vaultwarden',
    ]);
    expect(ids(store.listApps({ category: 'security', sort: 'new' }))).toEqual([
      'uptime-kuma',
      'vaultwarden',
      'immich',
    ]);
    expect(ids(store.listApps({ category: 'security', sort: 'name' }))).toEqual([
      'vaultwarden',
      'immich',
      'uptime-kuma',
    ]);
  });

  it('counts every app in the category', () => {
    expect(service().listApps({ category: 'security', sort: 'popular' }).counts).toEqual({ all: 3, installed: 0 });
  });

  it('on arm64, apps that run here come first within the sort', () => {
    const store = service({ os: 'macos', arm64: true }, ['uptime-kuma']);
    expect(ids(store.listApps({ category: 'security', sort: 'popular' }))).toEqual([
      'immich',
      'vaultwarden',
      'uptime-kuma',
    ]);
  });

  it('pages with a cursor: every app once, then no next page', () => {
    const store = service();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const r = store.listApps({ category: 'security', sort: 'name', limit: 2, cursor });
      seen.push(...ids(r));
      if (!r.nextCursor) break;
      cursor = r.nextCursor;
    }
    expect(seen).toEqual(['vaultwarden', 'immich', 'uptime-kuma']);
    expect(store.listApps({ category: 'security', limit: 50 }).nextCursor).toBeNull();
  });

  it('a page is 50 apps unless asked otherwise', () => {
    const db = openDb({ dataDir: tempDir() });
    const catalog = new CatalogService(db, storeFixture({ apps: [] }), silentLogger());
    catalog.syncBuiltin();
    const store = new StoreService(db, catalog, { os: 'linux', arm64: false });
    // 60 made-up apps straight into the catalogue (their manifests only need to parse).
    const base = new CatalogService(openDb({ dataDir: tempDir() }), storeFixture({ apps: ['immich'] }), silentLogger());
    base.syncBuiltin();
    const manifest = base.get('immich')!.manifest;
    for (let i = 0; i < 60; i++) {
      const id = `app-${String(i).padStart(2, '0')}`;
      db.insert(catalogApps)
        .values({
          sourceId: 'builtin',
          appId: id,
          version: '1',
          manifestJson: { ...manifest, id, name: `App ${String(i).padStart(2, '0')}` },
          updatedAt: 1,
          firstSeenAt: 1,
        })
        .run();
    }
    const first = store.listApps({ sort: 'name' });
    expect(first.items).toHaveLength(50);
    expect(first.counts.all).toBe(60);
    const second = store.listApps({ sort: 'name', cursor: first.nextCursor! });
    expect(ids(second)).toEqual(Array.from({ length: 10 }, (_, i) => `app-${50 + i}`));
    expect(second.nextCursor).toBeNull();
  });

  it('members see a category only while "Members can install apps" is on', async () => {
    const d = await daemonWithAdmin(closers, {
      resources: { storeDir: storeFixture(), binDir: '/none', webFallbackDir: '/none', webDir: '/none' },
    } as never);
    const member = ulid();
    d.services!.db.insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${d.services!.sessions.create({ userId: member }).raw}`;
    const input = encodeURIComponent(JSON.stringify({ category: 'files', sort: 'popular' }));
    const asMember = async () =>
      (await (await fetch(`${d.url}/trpc/store.listApps?input=${input}`, { headers: { cookie } })).json()) as {
        result?: { data: { items: Array<{ id: string }> } };
        error?: { data: { hlabsCode: string } };
      };
    expect((await asMember()).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    setSetting(d.services!.db, 'people', {
      showUserList: true,
      requireTotp: false,
      membersCanInstall: true,
      membersCanSeeUsage: false,
    });
    expect((await asMember()).result?.data.items.map((a) => a.id)).toEqual(['immich']);
  });
});
