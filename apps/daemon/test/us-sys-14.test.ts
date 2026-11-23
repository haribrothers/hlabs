// US-SYS-14 · Empty everyone's trash (server side): files.emptyTrash { allUsers: true } deletes every person's Trash
// for good, admins only, audited; storage.summary says how big everyone's Trash is; a big one empties as a job.
import { auditLog, trashItems } from '@hlabs/db';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withTrash() {
  const f = await filesDaemon(closers);
  f.put('users/hari/a.txt', 'aaa');
  f.put('users/anu/b.txt', 'bbbbb');
  await f.d.mutate('files.trash', { paths: ['/home/a.txt'] });
  await f.anu.mutate('files.trash', { paths: ['/home/b.txt'] });
  return f;
}

describe('US-SYS-14', () => {
  it("storage.summary has everyone's Trash, and emptying it deletes every person's items for good, audited", async () => {
    const f = await withTrash();
    const paths = f.db
      .select()
      .from(trashItems)
      .all()
      .map((r) => r.trashPath);
    expect(f.data(await f.d.query('storage.summary'))).toMatchObject({ trashBytes: 8, trashCount: 2 });

    expect(f.data(await f.d.mutate('files.emptyTrash', { allUsers: true }))).toEqual({ ok: true });
    expect(f.db.select().from(trashItems).all()).toEqual([]);
    expect(paths.every((p) => !existsSync(p))).toBe(true);
    expect(
      f.db
        .select()
        .from(auditLog)
        .all()
        .find((a) => a.action === 'files.empty_trash'),
    ).toMatchObject({
      userId: f.d.userId,
      detailJson: { count: 2, bytes: 8, allUsers: true },
    });
    expect(f.data(await f.d.query('storage.summary'))).toMatchObject({ trashBytes: 0, trashCount: 0 });
  });

  it("a member can't empty everyone's Trash, and nothing is deleted", async () => {
    const f = await withTrash();
    expect(f.code(await f.anu.mutate('files.emptyTrash', { allUsers: true }))).toBe('ACCESS_DENIED');
    expect(f.db.select().from(trashItems).all()).toHaveLength(2);
    expect(f.code(await f.anu.query('storage.summary'))).toBe('ACCESS_DENIED');
  });

  it('a big Trash for everyone empties as a job', async () => {
    const f = await withTrash();
    f.d.services!.filesTrash.emptyJobBytes = 4;
    const { jobId } = f.data<{ jobId: string }>(await f.d.mutate('files.emptyTrash', { allUsers: true }));
    expect(f.d.services!.jobs.get(jobId)?.kind).toBe('empty_trash');
    await f.d.services!.jobs.settled(jobId);
    expect(f.db.select().from(trashItems).all()).toEqual([]);
  });
});
