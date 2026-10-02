// US-STORE-01 · Browse the store home: store.getHome, "See all" through store.listApps, member access and logos.
import { apps, appSources, catalogApps, openDb, setSetting, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { CatalogService } from '../src/store/catalog';
import { StoreService } from '../src/store/service';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';
import { storeFixture } from './store-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const CURATION = `featured: [immich, vaultwarden]
collections:
  - { id: popular, title: Popular with families, appIds: [vaultwarden, immich, uptime-kuma] }
`;

function service(
  host: { os: 'macos' | 'linux'; arm64: boolean },
  fixture = storeFixture({ amd64Only: ['vaultwarden'], curation: CURATION }),
) {
  const db = openDb({ dataDir: tempDir() });
  const catalog = new CatalogService(db, fixture, silentLogger());
  catalog.syncBuiltin();
  return { db, store: new StoreService(db, catalog, host) };
}

describe('US-STORE-01 · store home', () => {
  it('has featured apps and rows from the curation, and the app count', () => {
    const { store } = service({ os: 'linux', arm64: false });
    const home = store.getHome();
    expect(home.featured.map((a) => a.id)).toEqual(['immich', 'vaultwarden']);
    expect(home.collections).toHaveLength(1);
    expect(home.collections[0]).toMatchObject({ id: 'popular', title: 'Popular with families' });
    expect(home.collections[0]!.apps.map((a) => a.id)).toEqual(['vaultwarden', 'immich', 'uptime-kuma']);
    expect(home.totalApps).toBe(3);
    expect(home.featured[0]).toMatchObject({
      name: 'Immich',
      tagline: 'Back up every photo from your phone',
      category: 'photos',
      group: 'files',
      tags: ['local-ai'],
      arm64: true,
      installed: false,
      icon: { logoUrl: '/api/store/apps/builtin/immich/assets/logo.svg', fallback: 'images' },
    });
  });

  it('on an arm64 computer, apps without an arm64 image come last in rows and are never featured', () => {
    const { store } = service({ os: 'macos', arm64: true });
    const home = store.getHome();
    expect(home.host).toEqual({ os: 'macos', arm64: true });
    expect(home.featured.map((a) => a.id)).toEqual(['immich']);
    expect(home.collections[0]!.apps.map((a) => a.id)).toEqual(['immich', 'uptime-kuma', 'vaultwarden']);
    expect(home.collections[0]!.apps.at(-1)!.arm64).toBe(false);
  });

  it('without curated rows, shows one row of every app A–Z', () => {
    const { store } = service({ os: 'linux', arm64: false }, storeFixture({ curation: '' }));
    const home = store.getHome();
    expect(home.featured).toEqual([]);
    expect(home.collections).toEqual([{ id: 'all', title: '', apps: expect.any(Array) }]);
    expect(home.collections[0]!.apps.map((a) => a.name)).toEqual(['Immich', 'Uptime Kuma', 'Vaultwarden']);
  });

  it('"See all" lists a row’s apps in its order, with its title', () => {
    const { store } = service({ os: 'linux', arm64: false });
    const list = store.listApps({ collection: 'popular' });
    expect(list.title).toBe('Popular with families');
    expect(list.items.map((a) => a.id)).toEqual(['vaultwarden', 'immich', 'uptime-kuma']);
    expect(store.listApps({ collection: 'all' }).items).toHaveLength(3);
    expect(() => store.listApps({ collection: 'nope' })).toThrow();
  });

  it('marks installed apps and shows an app in two sources once, from the built-in source', () => {
    const { db, store } = service({ os: 'linux', arm64: false });
    db.insert(apps)
      .values({ id: 'immich', version: '1', state: 'running', hostname: 'immich', installedAt: 1, updatedAt: 1 })
      .run();
    db.insert(appSources).values({ id: 'other', kind: 'index', name: 'Other', url: 'https://example.com' }).run();
    const other = db
      .select()
      .from(catalogApps)
      .all()
      .find((r) => r.appId === 'immich')!;
    db.insert(catalogApps)
      .values({
        ...other,
        sourceId: 'other',
        manifestJson: { ...(other.manifestJson as object), name: 'Immich (other)' },
      })
      .run();
    const all = store.listApps({}).items;
    expect(all.filter((a) => a.id === 'immich')).toEqual([
      expect.objectContaining({ sourceId: 'builtin', name: 'Immich', installed: true }),
    ]);
  });
});

describe('US-STORE-01 · access and logos', () => {
  async function daemon() {
    const d = await daemonWithAdmin(closers, {
      resources: { storeDir: storeFixture(), binDir: '/none', webFallbackDir: '/none' },
    } as never);
    const member = ulid();
    d.services!.db.insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const memberCookie = `hlabs_session=${d.services!.sessions.create({ userId: member }).raw}`;
    return { d, memberCookie };
  }

  it('admins browse; members only while "Members can install apps" is on', async () => {
    const { d, memberCookie } = await daemon();
    expect((await d.query('store.getHome')).result?.data.totalApps).toBe(3);
    const asMember = async () =>
      (await (await fetch(`${d.url}/trpc/store.getHome`, { headers: { cookie: memberCookie } })).json()) as {
        error?: { data: { hlabsCode: string } };
      };
    expect((await asMember()).error?.data.hlabsCode).toBe('ACCESS_DENIED');
    setSetting(d.services!.db, 'people', {
      showUserList: true,
      requireTotp: false,
      membersCanInstall: true,
      membersCanSeeUsage: false,
    });
    expect((await asMember()).error).toBeUndefined();
  });

  it('serves the logo to anyone signed in, with a CSP that stops scripts, and nothing else from the folder', async () => {
    const { d, memberCookie } = await daemon();
    const logo = await fetch(`${d.url}/api/store/apps/builtin/immich/assets/logo.svg`, {
      headers: { cookie: memberCookie },
    });
    expect(logo.status).toBe(200);
    expect(logo.headers.get('content-type')).toBe('image/svg+xml');
    expect(logo.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(logo.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await logo.text()).toContain('<svg');
    const signedOut = await fetch(`${d.url}/api/store/apps/builtin/immich/assets/logo.svg`);
    expect(signedOut.status).toBe(401);
    await signedOut.arrayBuffer();
    for (const path of [
      'hlabs-app.yml',
      'docker-compose.yml',
      '..%2F..%2Fcuration.yml',
      'screenshots%2F..%2Flogo.svg',
      'screenshots%2F..%2F..%2Fvaultwarden%2Flogo.svg',
    ]) {
      const res = await fetch(`${d.url}/api/store/apps/builtin/immich/assets/${path}`, {
        headers: { cookie: d.cookie },
      });
      expect(res.status, path).toBe(404);
      await res.arrayBuffer();
    }
    // An installed app's logo, by its id.
    d.services!.db.insert(apps)
      .values({
        id: 'immich',
        sourceId: 'builtin',
        version: '1',
        state: 'running',
        hostname: 'immich',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    expect((await fetch(`${d.url}/api/apps/immich/assets/logo.svg`, { headers: { cookie: d.cookie } })).status).toBe(
      200,
    );
  });
});
