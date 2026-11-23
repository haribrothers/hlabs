// US-SYS-11 · See what is using storage (server side): storage.summary splits the data folder's disk into Apps, Files
// (`users/`, `shared/` and the Trash on the storage root), the backup cache (restic's) and hlabs (its data folder and
// programs, without what's counted elsewhere), and names the disk's kind. Folder sizes are counted in the background
// and kept 10 minutes; nothing mounted inside a folder is walked.
import { storageLocations } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { lstatSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { storageByUse, type StorageByUseDeps } from '../src/storage/by-use';
import { SIZES_CACHE_MS, StorageSizes, treeBytes } from '../src/storage/sizes';
import { daemonWithAdmin } from './admin-session';
import { FakeSystemProbe } from './fakes/system';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const GB = 1e9;

function put(path: string, bytes: number) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.alloc(bytes));
}

describe('US-SYS-11', () => {
  it('counts a folder without the folders left out, and never follows links', async () => {
    const dir = tempDir('tree-');
    put(join(dir, 'a.bin'), 1000);
    put(join(dir, 'deep', 'b.bin'), 500);
    put(join(dir, 'skip', 'c.bin'), 9000);
    const elsewhere = tempDir('elsewhere-');
    put(join(elsewhere, 'd.bin'), 7000);
    symlinkSync(elsewhere, join(dir, 'link'));
    // The link is its own few bytes, never the 7000 it points at.
    const link = lstatSync(join(dir, 'link')).size;
    expect(await treeBytes(dir, new Set([join(dir, 'skip')]))).toBe(1500 + link);
    expect(await treeBytes(join(dir, 'missing'))).toBe(0);
  });

  it('Files, the backup cache and hlabs, each counted once, kept for 10 minutes', async () => {
    const data = tempDir('data-');
    const root = join(data, 'storage');
    const bin = tempDir('bin-');
    let now = 1_000;
    const sizes = new StorageSizes({
      dataDir: data,
      binDir: bin,
      appDataDir: join(data, 'app-data'),
      resticCacheDir: join(data, 'cache', 'restic'),
      mountsDir: join(data, 'mounts'),
      storageRoot: () => root,
      now: () => now,
    });
    put(join(root, 'users', 'hari', 'photo.jpg'), 3000);
    put(join(root, 'shared', 'film.mkv'), 2000);
    put(join(root, '.trash', 'u1', 'old.txt'), 100);
    put(join(root, 'app-like', 'ignored.bin'), 50);
    put(join(data, 'app-data', 'immich', 'x.bin'), 8000);
    put(join(data, 'cache', 'restic', 'pack'), 700);
    put(join(data, 'mounts', 'nas', 'huge.bin'), 9999);
    put(join(data, 'hlabs.db'), 400);
    put(join(bin, 'caddy'), 600);
    expect(await sizes.get()).toEqual({ filesBytes: 5100, backupCacheBytes: 700, hlabsBytes: 1000 });

    put(join(root, 'users', 'hari', 'more.jpg'), 1000);
    now += SIZES_CACHE_MS - 1;
    expect((await sizes.get())!.filesBytes).toBe(5100);
    now += 2;
    expect((await sizes.get())!.filesBytes).toBe(6100);
    sizes.forget();
    put(join(root, 'users', 'hari', 'third.jpg'), 1000);
    expect((await sizes.get())!.filesBytes).toBe(7100);
  });

  it('the split: Files when the storage root is on this disk; hlabs and the backup cache are part of the rest', async () => {
    const d = await daemonWithAdmin(closers);
    const system = new FakeSystemProbe();
    const base: StorageByUseDeps = {
      db: d.services!.db,
      system,
      disk: { get: async () => null },
      appDataDir: '/Users/hari/hlabs/app-data',
      engineKind: () => 'colima',
      dataDir: '/Users/hari/Library/Application Support/hlabs',
      storageRoot: () => '/Users/hari/hlabs',
      sizes: async () => ({ filesBytes: 20 * GB, backupCacheBytes: 10 * GB, hlabsBytes: 7 * GB }),
    };
    expect(await storageByUse(base, '/Users/hari/hlabs')).toMatchObject({
      usedBytes: 114 * GB,
      filesBytes: 20 * GB,
      systemBytes: 94 * GB,
      backupCacheBytes: 10 * GB,
      hlabsBytes: 7 * GB,
    });
    // The storage root on a NAS: its files aren't on this disk.
    system.disks.set('/Users/hari/hlabs', 'nas');
    expect((await storageByUse(base, '/Users/hari/Library')).filesBytes).toBe(0);
    // Still counting: 0 for now.
    expect(await storageByUse({ ...base, sizes: async () => null }, '/Users/hari/hlabs')).toMatchObject({
      filesBytes: 0,
      hlabsBytes: 0,
      backupCacheBytes: 0,
    });
  });

  it('storage.summary counts Files on the storage root and names the disk', async () => {
    const system = new FakeSystemProbe();
    const d = await daemonWithAdmin(closers, {}, { system });
    const root = tempDir('root-');
    d.services!.db.insert(storageLocations)
      .values({ id: ulid(), kind: 'local', name: 'This computer', path: root, isRoot: true })
      .run();
    put(join(root, 'users', 'hari', 'Photos', 'a.jpg'), 4096);
    const summary = (await d.query('storage.summary')).result!.data;
    expect(summary).toMatchObject({ filesBytes: 4096, diskKind: 'internalSsd', totalBytes: 256e9, freeBytes: 142e9 });
    expect(summary.hlabsBytes).toBeGreaterThan(0);

    system.media = { internal: true, solidState: false };
    d.services!.storageSizes.forget();
    expect((await d.query('storage.summary')).result!.data.diskKind).toBe('internalDisk');
    system.media = { internal: false, solidState: true };
    expect((await d.query('storage.summary')).result!.data.diskKind).toBe('external');
    system.media = { internal: null, solidState: null };
    expect((await d.query('storage.summary')).result!.data.diskKind).toBeNull();
  });
});
