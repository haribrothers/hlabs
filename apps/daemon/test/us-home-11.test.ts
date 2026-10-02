// US-HOME-11 · See only my shared apps on a member Home (server side).
import { apps, getSetting, homeLayout, setSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setup() {
  const d = await daemonWithAdmin(closers);
  const { db } = d.services!;
  for (const [i, id] of ['jellyfin', 'immich', 'nextcloud', 'home-assistant', 'vaultwarden'].entries())
    db.insert(apps)
      .values({ id, version: '1', state: 'running', hostname: id, installedAt: i + 1, updatedAt: 1 })
      .run();
  const anu = await memberSession(d, { appIds: ['jellyfin', 'immich', 'nextcloud', 'home-assistant'] });
  return { d, db, anu };
}

describe('US-HOME-11', () => {
  it('apps.list for a member has exactly the apps shared with them', async () => {
    const { anu } = await setup();
    const listed = (await anu.query('apps.list')).result!.data.apps as Array<{ id: string }>;
    expect(listed.map((a) => a.id)).toEqual(['jellyfin', 'immich', 'nextcloud', 'home-assistant']);
  });

  it('their layout never has the admin widgets, even if saved; live usage only when both switches allow it', async () => {
    const { d, db, anu } = await setup();
    const widgets = async () =>
      ((await anu.query('home.getLayout')).result!.data.items as Array<{ kind: string; id: string }>)
        .filter((i) => i.kind === 'widget')
        .map((i) => i.id);
    expect(await widgets()).toEqual(['my-files', 'shared-apps']);
    // Saved while they were an admin, say.
    db.insert(homeLayout)
      .values({
        userId: anu.userId,
        itemsJson: ['live-usage', 'storage', 'remote-access', 'backups'].map((id) => ({ kind: 'widget' as const, id })),
        dockJson: [],
      })
      .run();
    expect(await widgets()).toEqual([]);
    db.delete(homeLayout).run();
    setSetting(db, 'people', { ...getSetting(db, 'people'), membersCanSeeUsage: true });
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: ['jellyfin'], canSeeUsage: true });
    expect(await widgets()).toEqual(['my-files', 'shared-apps', 'live-usage']);
  });

  it('a newly shared app is appended to their grid; one taken away drops out', async () => {
    const { d, anu } = await setup();
    const appsOf = async () =>
      ((await anu.query('home.getLayout')).result!.data.items as Array<{ kind: string; id: string }>)
        .filter((i) => i.kind === 'app')
        .map((i) => i.id);
    await d.mutate('users.setAppAccess', {
      userId: anu.userId,
      appIds: ['jellyfin', 'immich', 'nextcloud', 'vaultwarden'],
    });
    expect(await appsOf()).toEqual(['jellyfin', 'immich', 'nextcloud', 'vaultwarden']);
  });
});
