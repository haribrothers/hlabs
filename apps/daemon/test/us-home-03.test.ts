// US-HOME-03 · Open my apps from the grid (server side): apps.list and the layout's app order.
import { appAccess, apps, appSources, catalogApps, homeLayout, setSetting, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { getLayout } from '../src/home/layout';
import { listApps } from '../src/apps/list';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withApps() {
  const d = await daemonWithAdmin(closers);
  const db = d.services!.db;
  db.insert(appSources)
    .values({ id: 'builtin', kind: 'builtin', name: 'hlabs', url: 'builtin:' })
    .onConflictDoNothing()
    .run();
  const add = (id: string, name: string, at: number, icon?: object) => {
    db.insert(catalogApps)
      .values({
        sourceId: 'builtin',
        appId: id,
        version: '1',
        manifestJson: { name, icon, web: { embed: id === 'immich' } },
        updatedAt: 1,
        firstSeenAt: 1,
      })
      .run();
    db.insert(apps)
      .values({
        id,
        sourceId: 'builtin',
        version: '1',
        state: 'running',
        hostname: id,
        portFallback: 12000 + at,
        installedAt: at,
        updatedAt: at,
      })
      .run();
  };
  add('jellyfin', 'Jellyfin', 1, { logo: 'logo.svg', gradient: ['#8b5cf6', '#4c1d95'], fallback: 'film' });
  add('immich', 'Immich', 2);
  add('pihole', 'Pi-hole', 3);
  return d;
}

describe('US-HOME-03', () => {
  it('apps.list: manifest name and icon, state, and where each app opens', async () => {
    const d = await withApps();
    setSetting(d.services!.db, 'remote', { state: 'connected', tailnetName: 'tail1234.ts.net' });
    const list = (await d.query('apps.list')).result!.data as { apps: Array<Record<string, unknown>> };
    expect(list.apps.map((a) => a.name)).toEqual(['Jellyfin', 'Immich', 'Pi-hole']);
    expect(list.apps[0]).toEqual({
      id: 'jellyfin',
      name: 'Jellyfin',
      state: 'running',
      icon: { logoUrl: '/api/apps/jellyfin/assets/logo.svg', gradient: ['#8b5cf6', '#4c1d95'], fallback: 'film' },
      embed: false,
      ownLogin: false,
      urls: { local: 'https://jellyfin.hlabs.local', tailnet: 'https://hlabs.tail1234.ts.net:12001' },
    });
    expect(list.apps[1]).toMatchObject({ embed: true, icon: { logoUrl: null, gradient: null, fallback: null } });
  });

  it('members see only apps shared with them; the saved order drops removed apps and appends new ones', async () => {
    const d = await withApps();
    const db = d.services!.db;
    const member = ulid();
    db.insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    db.insert(appAccess).values({ appId: 'immich', userId: member }).run();
    expect(listApps(db, { id: member, role: 'member' }).apps.map((a) => a.id)).toEqual(['immich']);

    db.insert(homeLayout)
      .values({
        userId: d.userId,
        itemsJson: [
          { kind: 'widget', id: 'storage' },
          { kind: 'app', id: 'pihole' },
          { kind: 'app', id: 'gone' },
          { kind: 'app', id: 'jellyfin' },
        ],
        dockJson: ['gone', 'immich'],
      })
      .run();
    expect(getLayout(db, { id: d.userId, role: 'admin' })).toEqual({
      items: [
        { kind: 'widget', id: 'storage' },
        { kind: 'app', id: 'pihole' },
        { kind: 'app', id: 'jellyfin' },
        { kind: 'app', id: 'immich' },
      ],
      dock: ['immich'],
    });
  });
});
