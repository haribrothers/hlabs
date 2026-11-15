// US-FILE-07 · Open a file with an app (server side): files.openWith lists running apps whose folders hold the file,
// only those the person can open, each once; none when no app uses the folder.
import { appAccess, appMounts, apps } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type OpenWith = { apps: Array<{ id: string; name: string; urls: { local: string } }> };

describe('US-FILE-07', () => {
  it("running apps that mount the file's folder, once each, for the people they are shared with", async () => {
    const f = await filesDaemon(closers);
    const app = (id: string, state: 'running' | 'stopped', installedAt: number) =>
      f.db.insert(apps).values({ id, version: '1', state, hostname: id, installedAt, updatedAt: 1 }).run();
    const mount = (appId: string, subpath: string, target = 'photos') =>
      f.db.insert(appMounts).values({ id: ulid(), appId, target, storageLocationId: f.rootId, subpath }).run();
    app('immich', 'running', 1);
    app('nextcloud', 'running', 2);
    app('photoprism', 'stopped', 3);
    app('jellyfin', 'running', 4);
    mount('immich', 'users/hari/Photos');
    mount('immich', 'users/hari', 'home');
    mount('nextcloud', 'users/hari');
    mount('photoprism', 'users/hari/Photos');
    mount('jellyfin', 'shared/Movies');
    f.put('users/hari/Photos/2026/beach.jpg');
    f.put('users/hari/Documents/lease.pdf');
    f.put('shared/Movies/film.mkv');
    f.put('shared/Music/song.mp3');
    const open = async (who: typeof f.d | typeof f.anu, path: string) =>
      f.data<OpenWith>(await who.query('files.openWith', { path })).apps.map((a) => a.id);
    expect(await open(f.d, '/home/Photos/2026/beach.jpg')).toEqual(['immich', 'nextcloud']);
    expect(await open(f.d, '/home/Documents/lease.pdf')).toEqual(['immich', 'nextcloud']);
    expect(await open(f.d, '/shared/Movies/film.mkv')).toEqual(['jellyfin']);
    expect(await open(f.d, '/shared/Music/song.mp3')).toEqual([]);
    // Through This computer, the same file.
    expect(await open(f.d, '/users/hari/Photos/2026/beach.jpg')).toEqual(['immich', 'nextcloud']);
    const one = f.data<OpenWith>(await f.d.query('files.openWith', { path: '/shared/Movies/film.mkv' })).apps[0]!;
    expect(one).toMatchObject({ id: 'jellyfin', name: 'jellyfin', urls: { local: 'https://jellyfin.hlabs.local' } });
  });

  it('members only see apps shared with them', async () => {
    const f = await filesDaemon(closers);
    for (const id of ['immich', 'nextcloud'])
      f.db
        .insert(apps)
        .values({ id, version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 })
        .run();
    for (const id of ['immich', 'nextcloud'])
      f.db
        .insert(appMounts)
        .values({ id: ulid(), appId: id, target: 'x', storageLocationId: f.rootId, subpath: 'users/anu' })
        .run();
    f.db.insert(appAccess).values({ appId: 'nextcloud', userId: f.anu.userId }).run();
    f.put('users/anu/notes.txt');
    const found = f.data<OpenWith>(await f.anu.query('files.openWith', { path: '/home/notes.txt' })).apps;
    expect(found.map((a) => a.id)).toEqual(['nextcloud']);
    expect(f.code(await f.anu.query('files.openWith', { path: '/home' }))).toBe('FILES_INVALID_PATH');
  });
});
