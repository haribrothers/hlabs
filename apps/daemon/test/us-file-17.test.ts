// US-FILE-17 · Restore items from Trash (server side): files.listTrash lists only the caller's items, newest first,
// with where each came from; restoring puts an item back (its folder made again if gone, a taken name numbered); a
// drive that isn't connected keeps the item and says which; no ids restores everything.
import { storageLocations, trashItems } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Listed = { items: Array<{ name: string; kind: string; from: string[]; originalPath: string }> };
type Restored = {
  restored: Array<{ path: string }>;
  failed: Array<{ name: string; hlabsCode: string; location: string | null }>;
};

describe('US-FILE-17', () => {
  it('lists only the caller’s items, newest first, with where each came from', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Bills/march.pdf');
    f.put('users/hari/notes.txt');
    f.put('users/hari/Documents/Old/x.txt');
    f.put('users/anu/hers.txt');
    for (const path of ['/home/Documents/Bills/march.pdf', '/home/notes.txt', '/home/Documents/Old']) {
      await f.d.mutate('files.trash', { paths: [path] });
      await new Promise((r) => setTimeout(r, 5));
    }
    await f.anu.mutate('files.trash', { paths: ['/home/hers.txt'] });
    const mine = f.data<Listed>(await f.d.query('files.listTrash', {}));
    expect(mine.items.map((i) => [i.name, i.kind, i.from])).toEqual([
      ['Old', 'folder', ['Documents']],
      ['notes.txt', 'file', ['Home']],
      ['march.pdf', 'file', ['Documents', 'Bills']],
    ]);
    expect(f.data<Listed>(await f.anu.query('files.listTrash', {})).items.map((i) => i.name)).toEqual(['hers.txt']);
    // Someone else's item can't be restored.
    const hers = f.db
      .select()
      .from(trashItems)
      .all()
      .find((t) => t.originalPath === '/home/hers.txt')!;
    expect(f.data<Restored>(await f.d.mutate('files.restoreFromTrash', { ids: [hers.id] })).restored).toEqual([]);
  });

  it('restores to where it was, making its folder again, and numbers a name that’s taken', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Bills/march.pdf', 'old');
    f.put('users/hari/Documents/lease.pdf', 'first');
    await f.d.mutate('files.trash', { paths: ['/home/Documents/Bills/march.pdf', '/home/Documents/lease.pdf'] });
    rmSync(join(f.root, 'users/hari/Documents/Bills'), { recursive: true });
    f.put('users/hari/Documents/lease.pdf', 'second');
    const res = f.data<Restored>(await f.d.mutate('files.restoreFromTrash', {}));
    expect(res.restored.map((r) => r.path).sort()).toEqual([
      '/home/Documents/Bills/march.pdf',
      '/home/Documents/lease (2).pdf',
    ]);
    expect(readFileSync(join(f.root, 'users/hari/Documents/Bills/march.pdf'), 'utf8')).toBe('old');
    expect(readFileSync(join(f.root, 'users/hari/Documents/lease (2).pdf'), 'utf8')).toBe('first');
    expect(f.db.select().from(trashItems).all()).toEqual([]);
  });

  it('an item from a drive that isn’t connected stays, and says which drive', async () => {
    const f = await filesDaemon(closers);
    const nas = tempDir('nas-');
    mkdirSync(join(nas, '.trash'), { recursive: true });
    writeFileSync(join(nas, '.trash/scan.pdf'), 'x');
    f.db
      .insert(storageLocations)
      .values({
        id: 'nas',
        kind: 'smb',
        name: 'NAS · Media',
        path: nas,
        mountOptions: '{}',
        status: 'unreachable',
        appsAllowed: false,
      })
      .run();
    f.db
      .insert(trashItems)
      .values({
        id: ulid(),
        ownerUserId: f.d.userId!,
        originalPath: '/drives/nas/Scans/scan.pdf',
        trashPath: join(nas, '.trash/scan.pdf'),
        deletedAt: Date.now(),
        size: 1,
      })
      .run();
    const listed = f.data<Listed>(await f.d.query('files.listTrash', {}));
    expect(listed.items[0]?.from).toEqual(['NAS · Media', 'Scans']);
    const res = f.data<Restored>(await f.d.mutate('files.restoreFromTrash', {}));
    expect(res.failed).toEqual([
      { id: expect.any(String), name: 'scan.pdf', hlabsCode: 'NAS_UNREACHABLE', location: 'NAS · Media' },
    ]);
    expect(existsSync(join(nas, '.trash/scan.pdf'))).toBe(true);
    expect(f.db.select().from(trashItems).all()).toHaveLength(1);
  });
});
