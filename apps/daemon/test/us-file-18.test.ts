// US-FILE-18 · Empty Trash manually and automatically (server side): files.emptyTrash deletes only the caller's items
// for good, audited; a big Trash empties as a job; items over 30 days go on the hourly sweep, and an item already
// missing on disk just loses its row.
import { auditLog, trashItems } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { TRASH_KEEP_MS } from '../src/files/trash';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-FILE-18', () => {
  it('empties only the caller’s Trash, for good, and audits it', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/a.txt', 'aaa');
    f.put('users/hari/b.txt', 'bb');
    f.put('users/anu/c.txt', 'c');
    await f.d.mutate('files.trash', { paths: ['/home/a.txt', '/home/b.txt'] });
    await f.anu.mutate('files.trash', { paths: ['/home/c.txt'] });
    const mine = f.db
      .select()
      .from(trashItems)
      .all()
      .filter((r) => r.ownerUserId === f.d.userId);
    expect(f.data(await f.d.mutate('files.emptyTrash', {}))).toEqual({ ok: true });
    expect(mine.every((r) => !existsSync(r.trashPath))).toBe(true);
    expect(
      f.db
        .select()
        .from(trashItems)
        .all()
        .map((r) => r.originalPath),
    ).toEqual(['/home/c.txt']);
    expect(
      f.db
        .select()
        .from(auditLog)
        .all()
        .find((a) => a.action === 'files.empty_trash'),
    ).toMatchObject({
      userId: f.d.userId,
      detailJson: { count: 2, bytes: 5 },
    });
  });

  it('a big Trash empties as an empty_trash job', async () => {
    const f = await filesDaemon(closers);
    f.d.services!.filesTrash.emptyJobBytes = 2;
    f.put('users/hari/a.txt', 'aaa');
    await f.d.mutate('files.trash', { paths: ['/home/a.txt'] });
    const { jobId } = f.data<{ jobId: string }>(await f.d.mutate('files.emptyTrash', {}));
    expect(f.d.services!.jobs.get(jobId)?.kind).toBe('empty_trash');
    await f.d.services!.jobs.settled(jobId);
    expect(f.db.select().from(trashItems).all()).toEqual([]);
  });

  it('the hourly sweep deletes items over 30 days old; one missing on disk just loses its row', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/old.txt');
    f.put('users/hari/new.txt');
    await f.d.mutate('files.trash', { paths: ['/home/old.txt', '/home/new.txt'] });
    const old = f.db
      .select()
      .from(trashItems)
      .all()
      .find((r) => r.originalPath === '/home/old.txt')!;
    const now = Date.now();
    f.db
      .update(trashItems)
      .set({ deletedAt: now - TRASH_KEEP_MS - 1000 })
      .where((await import('drizzle-orm')).eq(trashItems.id, old.id))
      .run();
    f.db
      .insert(trashItems)
      .values({
        id: ulid(),
        ownerUserId: f.d.userId!,
        originalPath: '/home/gone.txt',
        trashPath: '/nowhere/gone',
        deletedAt: now - TRASH_KEEP_MS - 1,
        size: 1,
      })
      .run();
    await f.d.services!.trash.sweep(now);
    expect(existsSync(old.trashPath)).toBe(false);
    expect(
      f.db
        .select()
        .from(trashItems)
        .all()
        .map((r) => r.originalPath),
    ).toEqual(['/home/new.txt']);
  });

  it('everyone’s Trash waits for US-SYS-14', async () => {
    const f = await filesDaemon(closers);
    expect(f.code(await f.d.mutate('files.emptyTrash', { allUsers: true }))).toBe('NOT_IMPLEMENTED');
  });
});
