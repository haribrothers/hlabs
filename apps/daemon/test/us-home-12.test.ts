// US-HOME-12 · See my files and shared-apps summary (server side): home.getWidgetData for my-files and shared-apps.
import { apps, getSetting, setSetting, storageLocations } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { forgetHomeFolderSizes, homeFolderCounted } from '../src/storage/home-folder';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  forgetHomeFolderSizes();
  for (const close of closers.splice(0)) await close();
});

type Widgets = Record<string, { status: string; data: Record<string, unknown> }>;

async function setup() {
  const d = await daemonWithAdmin(closers);
  const { db } = d.services!;
  const root = tempDir('hlabs-root-');
  db.insert(storageLocations)
    .values({ id: ulid(), kind: 'local', name: 'This computer', path: root, isRoot: true })
    .run();
  for (const [id, state] of [
    ['jellyfin', 'running'],
    ['immich', 'running'],
    ['nextcloud', 'stopped'],
    ['vaultwarden', 'running'],
  ] as const)
    db.insert(apps).values({ id, version: '1', state, hostname: id, installedAt: 1, updatedAt: 1 }).run();
  const anu = await memberSession(d, { appIds: ['jellyfin', 'immich', 'nextcloud'] });
  const widgets = async (ids: string[]) =>
    (await anu.query('home.getWidgetData', { widgetIds: ids })).result!.data as Widgets;
  return { d, db, root, anu, widgets };
}

describe('US-HOME-12', () => {
  it('My files: the Home folder size, counted in the background and then kept', async () => {
    const { db, root, widgets } = await setup();
    const home = join(root, 'users', 'anu');
    mkdirSync(join(home, 'Photos'), { recursive: true });
    writeFileSync(join(home, 'a.txt'), 'x'.repeat(1_000));
    writeFileSync(join(home, 'Photos', 'b.jpg'), 'x'.repeat(3_200));
    expect((await widgets(['my-files']))['my-files']).toMatchObject({
      status: 'ok',
      data: { bytes: null, lastPhotoBackupAt: null },
    });
    await homeFolderCounted(db, 'anu');
    expect((await widgets(['my-files']))['my-files']!.data.bytes).toBe(4_200);
    // Kept for 10 minutes: a new file doesn't change it yet.
    writeFileSync(join(home, 'c.txt'), 'x'.repeat(500));
    expect((await widgets(['my-files']))['my-files']!.data.bytes).toBe(4_200);
  });

  it('Shared with you: how many shared apps run, who to ask, and whether members may install', async () => {
    const { d, db, widgets } = await setup();
    expect((await widgets(['shared-apps']))['shared-apps']!.data).toEqual({
      total: 3,
      running: 2,
      adminName: 'Hari',
      canInstall: false,
    });
    setSetting(db, 'people', { ...getSetting(db, 'people'), membersCanInstall: true });
    expect((await widgets(['shared-apps']))['shared-apps']!.data.canInstall).toBe(true);
    // Unknown widgets are left out.
    expect(Object.keys(await widgets(['nope', 'shared-apps']))).toEqual(['shared-apps']);
    expect(d).toBeDefined();
  });
});
