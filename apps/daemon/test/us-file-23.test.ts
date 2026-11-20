// US-FILE-23 · Rename a file or folder (server side): files.rename gives the new path; New folder's rules for names;
// read-only places and the tops of places can't be renamed; a folder an app keeps (or that holds one), or a network
// share, is FILES_IN_USE naming them until it's sent with force; shares follow the new name; members stay in their
// places.
import { appMounts, apps, fileShares } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-FILE-23', () => {
  it('renames a file or a folder in place and answers its new path', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Lease agreement.pdf');
    f.put('users/hari/Documents/Bills/march.pdf');
    const renamed = f.data<{ path: string }>(
      await f.d.mutate('files.rename', { path: '/home/Documents/Lease agreement.pdf', name: 'Lease 2026.pdf' }),
    );
    expect(renamed.path).toBe('/home/Documents/Lease 2026.pdf');
    expect(existsSync(join(f.root, 'users/hari/Documents/Lease 2026.pdf'))).toBe(true);
    expect(existsSync(join(f.root, 'users/hari/Documents/Lease agreement.pdf'))).toBe(false);
    await f.d.mutate('files.rename', { path: '/home/Documents/Bills', name: '  Bills 2026 ' });
    expect(existsSync(join(f.root, 'users/hari/Documents/Bills 2026/march.pdf'))).toBe(true);
  });

  it('refuses names New folder refuses, and names already there', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/a.txt');
    f.put('users/hari/Documents/b.txt');
    const rename = (name: string) => f.d.mutate('files.rename', { path: '/home/Documents/a.txt', name });
    expect(f.code(await rename('   '))).toBe('FILES_INVALID_NAME');
    expect(f.code(await rename('a/b.txt'))).toBe('FILES_INVALID_NAME');
    expect(f.code(await rename('x'.repeat(256)))).toBe('FILES_INVALID_NAME');
    const taken = await rename('b.txt');
    expect(taken.error?.data).toMatchObject({ hlabsCode: 'FILES_NAME_EXISTS', detail: { name: 'b.txt' } });
    // The same name is fine.
    expect(f.data<{ path: string }>(await rename('a.txt')).path).toBe('/home/Documents/a.txt');
  });

  it("can't rename in read-only places or the top of a place", async () => {
    const f = await filesDaemon(closers);
    expect(f.code(await f.d.mutate('files.rename', { path: '/home', name: 'Mine' }))).toBe('FILES_INVALID_PATH');
    expect(f.code(await f.d.mutate('files.rename', { path: '/users/hari', name: 'x' }))).toBe('FILES_INVALID_PATH');
    f.put('users/anu/notes.txt');
    expect(f.code(await f.anu.mutate('files.rename', { path: '/users/hari', name: 'x' }))).toBe('FILES_ACCESS_DENIED');
  });

  it('a folder an app keeps, or one holding it, is FILES_IN_USE with the app named, until forced', async () => {
    const f = await filesDaemon(closers);
    f.db
      .insert(apps)
      .values({ id: 'paperless', version: '1', state: 'running', hostname: 'p', installedAt: 1, updatedAt: 1 })
      .run();
    f.db
      .insert(appMounts)
      .values({
        id: ulid(),
        appId: 'paperless',
        target: 'consume',
        storageLocationId: f.rootId,
        subpath: 'users/hari/Scans/inbox',
      })
      .run();
    f.put('users/hari/Scans/inbox/one.pdf');
    f.put('users/hari/Other/two.pdf');
    for (const path of ['/home/Scans', '/home/Scans/inbox']) {
      const res = await f.d.mutate('files.rename', { path, name: 'Letters' });
      expect(res.error?.data).toMatchObject({ hlabsCode: 'FILES_IN_USE', detail: { apps: ['paperless'] } });
    }
    expect(existsSync(join(f.root, 'users/hari/Scans/inbox'))).toBe(true);
    // A folder beside it isn't in use.
    expect(f.code(await f.d.mutate('files.rename', { path: '/home/Other', name: 'Others' }))).toBeUndefined();
    await f.d.mutate('files.rename', { path: '/home/Scans', name: 'Letters', force: true });
    expect(existsSync(join(f.root, 'users/hari/Letters/inbox/one.pdf'))).toBe(true);
  });

  it('a network share of the folder is named as in use, and follows the new name', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Music/song.mp3');
    const real = realpathSync(join(f.root, 'users/hari/Music'));
    f.db.insert(fileShares).values({ id: ulid(), path: real, name: 'Music' }).run();
    const res = await f.d.mutate('files.rename', { path: '/home/Music', name: 'Songs' });
    expect(res.error?.data).toMatchObject({ hlabsCode: 'FILES_IN_USE', detail: { apps: ['Music'] } });
    await f.d.mutate('files.rename', { path: '/home/Music', name: 'Songs', force: true });
    expect(f.db.select().from(fileShares).get()?.path).toBe(join(realpathSync(join(f.root, 'users/hari')), 'Songs'));
  });
});
