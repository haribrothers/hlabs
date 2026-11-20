// US-FILE-16 · Move items to Trash with undo (server side): files.trash moves items to the caller's Trash (Shared's
// too) and answers their ids; restoring them is Undo; read-only places refuse; a network drive's items are
// FILES_NO_TRASH and files.delete removes them for good, audited.
import { auditLog, storageLocations, trashItems } from '@hlabs/db';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-FILE-16', () => {
  it('moves items to the Trash, answers their ids, and Undo restores them', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/a.pdf', 'a');
    f.put('users/hari/Documents/Old/b.txt', 'b');
    const { trashItemIds } = f.data<{ trashItemIds: string[] }>(
      await f.d.mutate('files.trash', { paths: ['/home/Documents/a.pdf', '/home/Documents/Old'] }),
    );
    expect(trashItemIds).toHaveLength(2);
    expect(existsSync(join(f.root, 'users/hari/Documents/a.pdf'))).toBe(false);
    const rows = f.db.select().from(trashItems).all();
    expect(rows.map((r) => r.originalPath).sort()).toEqual(['/home/Documents/Old', '/home/Documents/a.pdf']);
    expect(rows.every((r) => r.ownerUserId === f.d.userId)).toBe(true);
    const res = f.data<{ restored: Array<{ path: string }> }>(
      await f.d.mutate('files.restoreFromTrash', { ids: trashItemIds }),
    );
    expect(res.restored.map((r) => r.path).sort()).toEqual(['/home/Documents/Old', '/home/Documents/a.pdf']);
    expect(existsSync(join(f.root, 'users/hari/Documents/Old/b.txt'))).toBe(true);
    expect(f.db.select().from(trashItems).all()).toEqual([]);
  });

  it('an item deleted from Shared goes to the Trash of whoever deleted it; read-only places refuse', async () => {
    const f = await filesDaemon(closers, { memberApps: [] });
    f.put('shared/Movies/film.mkv');
    await f.d.mutate('files.trash', { paths: ['/shared/Movies/film.mkv'] });
    expect(f.db.select().from(trashItems).get()?.ownerUserId).toBe(f.d.userId);
    expect(f.code(await f.d.mutate('files.trash', { paths: ['/appdata'] }))).toBe('FILES_INVALID_PATH');
    expect(f.code(await f.d.mutate('files.trash', { paths: ['/home'] }))).toBe('FILES_INVALID_PATH');
  });

  it("a network drive's items aren't trashed; files.delete removes them for good, audited", async () => {
    const f = await filesDaemon(closers);
    const path = tempDir('nas-');
    mkdirSync(join(path, 'Movies'), { recursive: true });
    writeFileSync(join(path, 'Movies/film.mkv'), 'x');
    f.db
      .insert(storageLocations)
      .values({
        id: 'nas',
        kind: 'smb',
        name: 'NAS · Media',
        path,
        mountOptions: '{}',
        status: 'ok',
        appsAllowed: false,
      })
      .run();
    expect(f.code(await f.d.mutate('files.trash', { paths: ['/drives/nas/Movies/film.mkv'] }))).toBe('FILES_NO_TRASH');
    await f.d.mutate('files.delete', { paths: ['/drives/nas/Movies/film.mkv'] });
    expect(existsSync(join(path, 'Movies/film.mkv'))).toBe(false);
    expect(
      f.db
        .select()
        .from(auditLog)
        .all()
        .find((a) => a.action === 'files.delete'),
    ).toMatchObject({
      target: '/drives/nas/Movies/film.mkv',
      detailJson: { count: 1 },
    });
  });
});
