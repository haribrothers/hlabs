// US-FILE-01 · See my places in the sidebar (server side): the virtual places and who may use them, Home's first
// folders, "This computer", app data read only, drives, Recents, and paths that try to leave their place.
import { apps, storageLocations, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { existsSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { filesDaemon } from './files-fixture';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Listing = {
  path: string;
  crumbs: Array<{ path: string; name: string | null }>;
  place: { area: string; name: string | null; readOnly: boolean };
  items: Array<{ name: string; path: string; kind: string; size: number | null; childCount: number | null }>;
};

describe('US-FILE-01', () => {
  it('opening Home the first time makes Photos, Documents and Downloads; existing folders are never touched', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Lease agreement.pdf', 'pdf');
    const home = f.data<Listing>(await f.d.query('files.list', { path: '/home' }));
    expect(home.place).toEqual({ area: 'home', name: 'Hari', readOnly: false });
    expect(home.crumbs).toEqual([{ path: '/home', name: null }]);
    expect(home.items.map((i) => [i.name, i.path, i.childCount])).toEqual([
      ['Documents', '/home/Documents', 1],
      ['Downloads', '/home/Downloads', 0],
      ['Photos', '/home/Photos', 0],
    ]);
    // Only the first time: a folder the person removes isn't made again.
    rmSync(join(f.root, 'users/hari/Downloads'), { recursive: true });
    const again = f.data<Listing>(await f.d.query('files.list', { path: '/home' }));
    expect(again.items.map((i) => i.name)).toEqual(['Documents', 'Photos']);
    // Photos and Downloads in the sidebar are folders in Home.
    expect(f.data<Listing>(await f.d.query('files.list', { path: '/home/Photos' })).crumbs).toEqual([
      { path: '/home', name: null },
      { path: '/home/Photos', name: 'Photos' },
    ]);
    // A member's Home is theirs.
    const anuHome = f.data<Listing>(await f.anu.query('files.list', { path: '/home' }));
    expect(anuHome.place.name).toBe('Anu');
    expect(existsSync(join(f.root, 'users/anu/Photos'))).toBe(true);
  });

  it('members only reach their Home, and Shared with the permission, whatever the dashboard shows', async () => {
    const f = await filesDaemon(closers);
    const loc = ulid();
    f.db
      .insert(storageLocations)
      .values({ id: loc, kind: 'smb', name: 'NAS · Media', path: tempDir(), status: 'ok' })
      .run();
    for (const path of ['/users', '/users/hari', '/appdata', `/drives/${loc}`, '/shared', '/shared/Movies']) {
      const r = await f.anu.query('files.list', { path });
      expect([path, r.status, f.code(r)]).toEqual([path, 403, 'FILES_ACCESS_DENIED']);
    }
    expect(f.data<{ canSeeShared: boolean }>(await f.anu.query('auth.me')).canSeeShared).toBe(false);
    f.db.update(users).set({ canSeeShared: true }).where(eq(users.username, 'anu')).run();
    expect(f.data<{ canSeeShared: boolean }>(await f.anu.query('auth.me')).canSeeShared).toBe(true);
    f.put('shared/Movies/a.mkv');
    expect(f.data<Listing>(await f.anu.query('files.list', { path: '/shared' })).items.map((i) => i.name)).toEqual([
      'Movies',
    ]);
    // Admins always can.
    expect(f.data<{ canSeeShared: boolean }>(await f.d.query('auth.me')).canSeeShared).toBe(true);
  });

  it('This computer lists every Home folder by display name, and Shared', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/a.txt');
    f.put('users/anu/b.txt');
    f.put('users/old-deleted-2026-10-01/c.txt');
    f.put('users/.hidden/x');
    const computer = f.data<Listing>(await f.d.query('files.list', { path: '/users' }));
    expect(computer.place).toEqual({ area: 'users', name: null, readOnly: true });
    expect(computer.items.map((i) => [i.name, i.path])).toEqual([
      ['Anu', '/users/anu'],
      ['Hari', '/users/hari'],
      ['old-deleted-2026-10-01', '/users/old-deleted-2026-10-01'],
      ['Shared', '/shared'],
    ]);
    const anu = f.data<Listing>(await f.d.query('files.list', { path: '/users/anu' }));
    expect(anu.place).toEqual({ area: 'user', name: 'Anu', readOnly: false });
    expect(anu.crumbs).toEqual([
      { path: '/users', name: null },
      { path: '/users/anu', name: 'Anu' },
    ]);
    expect(anu.items.map((i) => i.name)).toEqual(['b.txt']);
  });

  it('App data is listed per app and read only', async () => {
    const f = await filesDaemon(closers);
    f.db
      .insert(apps)
      .values({ id: 'immich', version: '1', state: 'running', hostname: 'immich', installedAt: 1, updatedAt: 1 })
      .run();
    mkdirSync(join(f.appDataDir, 'immich', 'library'), { recursive: true });
    const list = f.data<Listing>(await f.d.query('files.list', { path: '/appdata' }));
    expect(list.items.map((i) => [i.name, i.path, i.childCount])).toEqual([['immich', '/appdata/immich', 1]]);
    const app = f.data<Listing>(await f.d.query('files.list', { path: '/appdata/immich' }));
    expect(app.place).toMatchObject({ area: 'app', readOnly: true });
    expect(f.code(await f.d.mutate('files.mkdir', { path: '/appdata/immich', name: 'x' }))).toBe('FILES_READ_ONLY');
    expect(f.code(await f.d.mutate('files.mkdir', { path: '/users', name: 'x' }))).toBe('FILES_READ_ONLY');
  });

  it('a drive that is not mounted answers NAS_UNREACHABLE; a mounted one lists', async () => {
    const f = await filesDaemon(closers);
    const dir = tempDir();
    writeFileSync(join(dir, 'Movie.mkv'), 'm');
    const id = ulid();
    f.db
      .insert(storageLocations)
      .values({ id, kind: 'smb', name: 'NAS · Media', path: dir, status: 'unreachable' })
      .run();
    expect(f.code(await f.d.query('files.list', { path: `/drives/${id}` }))).toBe('NAS_UNREACHABLE');
    f.db.update(storageLocations).set({ status: 'ok' }).where(eq(storageLocations.id, id)).run();
    const drive = f.data<Listing>(await f.d.query('files.list', { path: `/drives/${id}` }));
    expect(drive.place).toEqual({ area: 'drive', name: 'NAS · Media', readOnly: false });
    expect(drive.crumbs).toEqual([{ path: `/drives/${id}`, name: 'NAS · Media' }]);
    expect(drive.items.map((i) => i.name)).toEqual(['Movie.mkv']);
    // The storage root isn't a drive.
    expect(f.code(await f.d.query('files.list', { path: `/drives/${f.rootId}` }))).toBe('NOT_FOUND');
  });

  it('".." is refused, and symlinks leading outside are hidden and refused', async () => {
    const f = await filesDaemon(closers);
    const outside = tempDir();
    writeFileSync(join(outside, 'secret.txt'), 's');
    f.put('users/hari/inside.txt', 'i');
    symlinkSync(outside, join(f.root, 'users/hari/escape'));
    symlinkSync(join(f.root, 'users/hari/inside.txt'), join(f.root, 'users/hari/link.txt'));
    for (const path of ['/home/../anu', '/home/./x', '/etc', '/', 'home']) {
      const r = await f.d.query('files.list', { path });
      expect([path, f.code(r)]).toEqual([path, path === 'home' ? 'VALIDATION_FAILED' : 'FILES_INVALID_PATH']);
    }
    const names = f.data<Listing>(await f.d.query('files.list', { path: '/home' })).items.map((i) => i.name);
    expect(names).toContain('link.txt');
    expect(names).not.toContain('escape');
    expect(f.code(await f.d.query('files.list', { path: '/home/escape' }))).toBe('FILES_INVALID_PATH');
    expect(f.code(await f.d.query('files.stat', { path: '/home/escape/secret.txt' }))).toBe('FILES_INVALID_PATH');
  });

  it('Recents: the 50 most recently changed files in Home (and Shared when allowed), newest first', async () => {
    const f = await filesDaemon(closers);
    const t = Date.now() / 1000;
    for (let i = 0; i < 55; i++) {
      const p = f.put(`users/anu/${i % 2 ? 'Documents/' : ''}f${i}.txt`);
      utimesSync(p, t - 1000 + i, t - 1000 + i);
    }
    const hidden = f.put('users/anu/.secret');
    utimesSync(hidden, t, t);
    const shared = f.put('shared/new.txt');
    utimesSync(shared, t, t);
    const recent = async () =>
      f.data<{ items: Array<{ name: string; path: string }> }>(await f.anu.query('files.recent')).items;
    const first = await recent();
    expect(first).toHaveLength(50);
    expect(first[0]).toMatchObject({ name: 'f54.txt', path: '/home/f54.txt' });
    expect(first[1]).toMatchObject({ name: 'f53.txt', path: '/home/Documents/f53.txt' });
    expect(first.map((i) => i.name)).not.toContain('.secret');
    expect(first.map((i) => i.name)).not.toContain('new.txt');
    f.db.update(users).set({ canSeeShared: true }).where(eq(users.username, 'anu')).run();
    expect((await recent())[0]).toMatchObject({ name: 'new.txt', path: '/shared/new.txt' });
  });

  it('storage locations list their status for the sidebar (admins only)', async () => {
    const f = await filesDaemon(closers);
    f.db
      .insert(storageLocations)
      .values({ id: ulid(), kind: 'smb', name: 'NAS · Media', path: tempDir(), status: 'unreachable' })
      .run();
    const locs = f.data<{ locations: Array<{ name: string; status: string; isRoot: boolean }> }>(
      await f.d.query('storage.locations.list'),
    ).locations;
    expect(locs.map((l) => [l.name, l.status, l.isRoot])).toEqual([
      ['This computer', 'ok', true],
      ['NAS · Media', 'unreachable', false],
    ]);
    expect(f.code(await f.anu.query('storage.locations.list'))).toBe('ACCESS_DENIED');
    expect(f.code(await f.anu.query('storage.summary'))).toBe('ACCESS_DENIED');
  });
});
