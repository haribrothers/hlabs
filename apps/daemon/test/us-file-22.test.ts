// US-FILE-22 · Move items to another folder (server side): same disk is done at once and says where each went (so
// Undo moves them back); not into itself; names already there need a choice (skip, keep both, replace → Trash);
// across disks or over 1 GB it's a files_move job that copies, checks, then removes the originals; read-only places
// and other people's folders refuse.
import { trashItems } from '@hlabs/db';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Moved = { done: true; moved: Array<{ from: string; to: string }> };

describe('US-FILE-22', () => {
  it('on one disk moves at once and says where each went; moving back undoes it', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/a.pdf', 'aaa');
    f.put('users/hari/Documents/Old/b.txt', 'bb');
    f.put('users/hari/Documents/Taxes/keep.txt');
    const res = f.data<Moved>(
      await f.d.mutate('files.move', {
        paths: ['/home/Documents/a.pdf', '/home/Documents/Old'],
        to: '/home/Documents/Taxes',
      }),
    );
    expect(res).toEqual({
      done: true,
      moved: [
        { from: '/home/Documents/a.pdf', to: '/home/Documents/Taxes/a.pdf' },
        { from: '/home/Documents/Old', to: '/home/Documents/Taxes/Old' },
      ],
    });
    expect(readFileSync(join(f.root, 'users/hari/Documents/Taxes/Old/b.txt'), 'utf8')).toBe('bb');
    expect(existsSync(join(f.root, 'users/hari/Documents/a.pdf'))).toBe(false);
    // Undo: back where they were.
    await f.d.mutate('files.move', { paths: res.moved.map((m) => m.to), to: '/home/Documents' });
    expect(existsSync(join(f.root, 'users/hari/Documents/a.pdf'))).toBe(true);
    expect(existsSync(join(f.root, 'users/hari/Documents/Old/b.txt'))).toBe(true);
  });

  it("a folder can't go into itself or one of its folders", async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Old/Inner/x.txt');
    for (const to of ['/home/Documents/Old', '/home/Documents/Old/Inner']) {
      expect(f.code(await f.d.mutate('files.move', { paths: ['/home/Documents/Old'], to }))).toBe('FILES_INVALID_PATH');
    }
  });

  it('names already there need a choice: skip, keep both, or replace (the old one goes to the Trash)', async () => {
    const f = await filesDaemon(closers);
    for (const n of ['a.txt', 'b.txt', 'c.txt']) {
      f.put(`users/hari/In/${n}`, `new ${n}`);
      f.put(`users/hari/Out/${n}`, `old ${n}`);
    }
    const paths = ['/home/In/a.txt', '/home/In/b.txt', '/home/In/c.txt'];
    const res = await f.d.mutate('files.move', { paths, to: '/home/Out' });
    expect(res.error?.data).toMatchObject({
      hlabsCode: 'FILES_NAME_EXISTS',
      detail: { names: ['a.txt', 'b.txt', 'c.txt'] },
    });
    const moved = f.data<Moved>(
      await f.d.mutate('files.move', {
        paths,
        to: '/home/Out',
        conflicts: { 'a.txt': 'skip', 'b.txt': 'keepBoth', 'c.txt': 'replace' },
      }),
    );
    expect(moved.moved.map((m) => m.to)).toEqual(['/home/Out/b (2).txt', '/home/Out/c.txt']);
    const out = (n: string) => readFileSync(join(f.root, 'users/hari/Out', n), 'utf8');
    expect([out('a.txt'), out('b.txt'), out('b (2).txt'), out('c.txt')]).toEqual([
      'old a.txt',
      'old b.txt',
      'new b.txt',
      'new c.txt',
    ]);
    expect(existsSync(join(f.root, 'users/hari/In/a.txt'))).toBe(true);
    expect(
      f.db
        .select()
        .from(trashItems)
        .all()
        .map((t) => t.originalPath),
    ).toEqual(['/home/Out/c.txt']);
  });

  it('across disks (or over 1 GB) a files_move job copies, checks, puts in place, then removes the originals', async () => {
    const f = await filesDaemon(closers);
    const mover = f.d.services!.fileMover;
    mover.jobBytes = 4;
    mover.renameFn = async (from, to) => {
      // The item itself acts as if on another disk; the checked copy's final rename is local.
      if (!from.includes('.hlabs-move')) throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
      const { rename } = await import('node:fs/promises');
      await rename(from, to);
    };
    f.put('users/hari/Big/one.bin', 'x'.repeat(10));
    f.put('users/hari/Big/sub/two.bin', 'y'.repeat(20));
    mkdirTarget(f.root);
    const { jobId } = f.data<{ jobId: string }>(
      await f.d.mutate('files.move', { paths: ['/home/Big'], to: '/home/Target' }),
    );
    expect(f.d.services!.jobs.get(jobId)?.kind).toBe('files_move');
    await f.d.services!.jobs.settled(jobId);
    expect(f.d.services!.jobs.get(jobId)?.state).toBe('succeeded');
    expect(readFileSync(join(f.root, 'users/hari/Target/Big/sub/two.bin'), 'utf8')).toBe('y'.repeat(20));
    expect(existsSync(join(f.root, 'users/hari/Big'))).toBe(false);
    expect(existsSync(join(f.root, 'users/hari/Target/.Big.hlabs-move'))).toBe(false);
  });

  it('read-only places and other people’s folders refuse', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/a.txt');
    f.put('users/anu/b.txt');
    expect(f.code(await f.d.mutate('files.move', { paths: ['/home/a.txt'], to: '/appdata' }))).toBe('FILES_READ_ONLY');
    expect(f.code(await f.anu.mutate('files.move', { paths: ['/home/b.txt'], to: '/users/hari' }))).toBe(
      'FILES_ACCESS_DENIED',
    );
  });
});

function mkdirTarget(root: string) {
  mkdirSync(join(root, 'users/hari/Target'), { recursive: true });
}
