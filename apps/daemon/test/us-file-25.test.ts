// US-FILE-25 · Choose a folder for an app (server side): files.list for the FolderPicker (folders only, and the
// storage location and subpath a folder is), and the folders apps.install accepts: a member's only in their own Home
// (and Shared with the permission), never outside the drive through a symlink, and a folder the app writes to not read
// only.
import { appMounts, storageLocations } from '@hlabs/db';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';
import { installDaemon } from './install-harness';
import { tempDir } from './helpers';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Listing = {
  items: Array<{ name: string; kind: string }>;
  location: { id: string; subpath: string } | null;
  place: { readOnly: boolean };
  count: number;
};

const library = (extra: Record<string, unknown> = {}) => ({
  target: 'library',
  storageLocationId: 'root',
  subpath: 'users/hari/Photos',
  mode: 'rw',
  ...extra,
});

/** Root can write anywhere, so read-only checks only mean something as another user. */
const asRoot = process.getuid?.() === 0;

describe('US-FILE-25', () => {
  it('files.list with kinds [folder] lists folders only, and says which location and subpath the folder is', async () => {
    const f = await filesDaemon(closers);
    mkdirSync(join(f.root, 'users/hari/Photos/Camera roll'), { recursive: true });
    mkdirSync(join(f.root, 'users/hari/Photos/Holidays 2025'), { recursive: true });
    f.put('users/hari/Photos/cover.jpg');
    const list = f.data<Listing>(await f.d.query('files.list', { path: '/home/Photos', kinds: ['folder'] }));
    expect(list.items.map((i) => [i.name, i.kind])).toEqual([
      ['Camera roll', 'folder'],
      ['Holidays 2025', 'folder'],
    ]);
    expect(list.count).toBe(2);
    expect(list.location).toEqual({ id: f.rootId, subpath: 'users/hari/Photos' });
    // Without kinds, files are there too.
    const all = f.data<Listing>(await f.d.query('files.list', { path: '/home/Photos' }));
    expect(all.items.map((i) => i.name)).toContain('cover.jpg');

    const top = f.data<Listing>(await f.d.query('files.list', { path: '/home', kinds: ['folder'] }));
    expect(top.location).toEqual({ id: f.rootId, subpath: 'users/hari' });
    mkdirSync(join(f.root, 'shared/Media'), { recursive: true });
    const shared = f.data<Listing>(await f.d.query('files.list', { path: '/shared/Media', kinds: ['folder'] }));
    expect(shared.location).toEqual({ id: f.rootId, subpath: 'shared/Media' });
    mkdirSync(join(f.root, 'users/anu/Notes'), { recursive: true });
    const user = f.data<Listing>(await f.d.query('files.list', { path: '/users/anu/Notes', kinds: ['folder'] }));
    expect(user.location).toEqual({ id: f.rootId, subpath: 'users/anu/Notes' });
    expect(f.data<Listing>(await f.d.query('files.list', { path: '/users' })).location).toBeNull();
    expect(f.data<Listing>(await f.d.query('files.list', { path: '/appdata' })).location).toBeNull();

    const nas = tempDir('nas-');
    mkdirSync(join(nas, 'Photos/Phone backups'), { recursive: true });
    f.db.insert(storageLocations).values({ id: 'nas', kind: 'smb', name: 'NAS · Media', path: nas }).run();
    const drive = f.data<Listing>(await f.d.query('files.list', { path: '/drives/nas', kinds: ['folder'] }));
    expect(drive.location).toEqual({ id: 'nas', subpath: '' });
    const deeper = f.data<Listing>(await f.d.query('files.list', { path: '/drives/nas/Photos', kinds: ['folder'] }));
    expect(deeper.location).toEqual({ id: 'nas', subpath: 'Photos' });
    expect(deeper.items.map((i) => i.name)).toEqual(['Phone backups']);
  });

  it('a member lists their own Home with its location; other places stay closed to them', async () => {
    const f = await filesDaemon(closers);
    mkdirSync(join(f.root, 'users/anu/Photos'), { recursive: true });
    const mine = f.data<Listing>(await f.anu.query('files.list', { path: '/home', kinds: ['folder'] }));
    expect(mine.location).toEqual({ id: f.rootId, subpath: 'users/anu' });
    expect(f.code(await f.anu.query('files.list', { path: '/users/hari', kinds: ['folder'] }))).toBe(
      'FILES_ACCESS_DENIED',
    );
  });

  it('an admin installs with a folder on a network drive, as the picker sends it', async () => {
    const t = await installDaemon(closers);
    const nas = tempDir('nas-');
    mkdirSync(join(nas, 'Photos'));
    t.s.db.insert(storageLocations).values({ id: 'nas', kind: 'smb', name: 'NAS · Media', path: nas }).run();
    const res = (await t.d.mutate('apps.install', {
      appId: 'immich',
      mounts: [library({ storageLocationId: 'nas', subpath: 'Photos' })],
    })) as { result?: { data: { jobId: string } } };
    await t.s.jobs.settled(res.result!.data.jobId);
    expect(t.s.db.select().from(appMounts).all()).toEqual([
      expect.objectContaining({ target: 'library', storageLocationId: 'nas', subpath: 'Photos', mode: 'rw' }),
    ]);
  });

  it.skipIf(asRoot)('a folder the app writes to can’t be read only; a read-only folder can be anywhere', async () => {
    const t = await installDaemon(closers);
    const nas = tempDir('nas-');
    mkdirSync(join(nas, 'Archive'));
    chmodSync(join(nas, 'Archive'), 0o555);
    closers.push(async () => chmodSync(join(nas, 'Archive'), 0o755));
    t.s.db.insert(storageLocations).values({ id: 'nas', kind: 'smb', name: 'NAS · Archive', path: nas }).run();
    const rw = await t.d.mutate('apps.install', {
      appId: 'immich',
      mounts: [library({ storageLocationId: 'nas', subpath: 'Archive' })],
    });
    expect(rw.error?.data).toMatchObject({ hlabsCode: 'FILES_READ_ONLY', detail: { folder: 'library' } });
    // A folder that doesn't exist yet counts as the nearest folder above it.
    const below = await t.d.mutate('apps.install', {
      appId: 'immich',
      mounts: [library({ storageLocationId: 'nas', subpath: 'Archive/New' })],
    });
    expect(below.error?.data.hlabsCode).toBe('FILES_READ_ONLY');

    const { resolveMounts } = await import('../src/apps/folders');
    const manifest = t.s.catalog.get('immich')!.manifest;
    const ro = { ...manifest, folders: [{ ...manifest.folders[0]!, mode: 'ro' as const }] };
    const admin = { role: 'admin' as const, username: 'hari', canSeeShared: true };
    const [mount] = await resolveMounts(
      t.s.db,
      ro,
      [library({ storageLocationId: 'nas', subpath: 'Archive' }) as never],
      admin,
    );
    expect(mount).toMatchObject({ subpath: 'Archive', mode: 'ro' });
  });

  it.skipIf(asRoot)('storage.locations.list says which mounted drives hlabs can’t write to', async () => {
    const f = await filesDaemon(closers);
    const rw = tempDir('nas-');
    const ro = tempDir('nas-');
    chmodSync(ro, 0o555);
    closers.push(async () => chmodSync(ro, 0o755));
    f.db
      .insert(storageLocations)
      .values([
        { id: 'media', kind: 'smb', name: 'NAS · Media', path: rw },
        { id: 'archive', kind: 'smb', name: 'NAS · Archive', path: ro },
        { id: 'backups', kind: 'nfs', name: 'NAS · Backups', path: ro, status: 'unreachable' },
      ])
      .run();
    const { locations } = f.data<{ locations: Array<{ id: string; readOnly: boolean }> }>(
      await f.d.query('storage.locations.list'),
    );
    expect(Object.fromEntries(locations.map((l) => [l.id, l.readOnly]))).toEqual({
      [f.rootId]: false,
      media: false,
      archive: true,
      // Offline: away, not read only.
      backups: false,
    });
  });

  it('a folder can’t lead outside its drive through a symlink', async () => {
    const t = await installDaemon(closers);
    const outside = tempDir('outside-');
    writeFileSync(join(outside, 'secret'), 'x');
    symlinkSync(outside, join(t.root, 'users/hari/Escape'));
    const res = await t.d.mutate('apps.install', {
      appId: 'immich',
      mounts: [library({ subpath: 'users/hari/Escape/Photos' })],
    });
    expect(res.error?.data).toMatchObject({ hlabsCode: 'FILES_INVALID_PATH', detail: { folder: 'library' } });
  });

  it('a member installing chooses only in their own Home, and Shared with the permission (FILES_ACCESS_DENIED)', async () => {
    const t = await installDaemon(closers);
    await t.d.mutate('users.updatePolicy', { membersCanInstall: true });
    const anu = await memberSession(t.d);
    const nas = tempDir('nas-');
    t.s.db.insert(storageLocations).values({ id: 'nas', kind: 'smb', name: 'NAS · Media', path: nas }).run();
    const install = (subpath: string, storageLocationId = 'root') =>
      anu.mutate('apps.install', { appId: 'immich', mounts: [library({ storageLocationId, subpath })] });

    for (const [subpath, loc] of [
      ['users/hari/Photos', 'root'],
      ['users', 'root'],
      ['users/anuj/Photos', 'root'],
      ['shared/Media', 'root'],
      ['', 'root'],
      ['Photos', 'nas'],
    ] as const) {
      const refused = await install(subpath, loc);
      expect(refused.error?.data, `${loc}:${subpath}`).toMatchObject({
        hlabsCode: 'FILES_ACCESS_DENIED',
        detail: { folder: 'library' },
      });
    }
    expect(t.s.db.select().from(appMounts).all()).toEqual([]);

    await t.d.mutate('users.setAppAccess', { userId: anu.userId, appIds: [], canSeeShared: true });
    const shared = await install('shared/Family photos');
    expect(shared.result?.data).toHaveProperty('jobId');
    await t.s.jobs.settled((shared.result!.data as { jobId: string }).jobId);
    expect(t.s.db.select().from(appMounts).all()).toEqual([
      expect.objectContaining({ storageLocationId: 'root', subpath: 'shared/Family photos' }),
    ]);
  });

  it('a member’s own Home folder is theirs to choose', async () => {
    const t = await installDaemon(closers);
    await t.d.mutate('users.updatePolicy', { membersCanInstall: true });
    const anu = await memberSession(t.d);
    const res = await anu.mutate('apps.install', {
      appId: 'immich',
      mounts: [library({ subpath: 'users/anu/Photos' })],
    });
    expect(res.result?.data).toHaveProperty('jobId');
  });
});
