// US-FILE-10 · Handle name conflicts when uploading (server side): keep both saves "<name> (2).<ext>" (the next free
// number), replace moves the old file to the Trash, skip writes nothing; the choice is checked again when it finishes.
import { trashItems } from '@hlabs/db';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { freeName } from '../src/files/uploads';
import { filesDaemon, uploadClient } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-FILE-10', () => {
  it('keep both saves "<name> (2).<ext>", then (3)', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Docs/Report.pdf', 'v1');
    const up = uploadClient(f.d.url, f.d);
    expect((await up.send('/home/Docs', 'Report.pdf', 'v2', 'keepBoth')).done).toEqual({
      path: '/home/Docs/Report (2).pdf',
      name: 'Report (2).pdf',
    });
    expect((await up.send('/home/Docs', 'Report.pdf', 'v3', 'keepBoth')).done).toMatchObject({
      name: 'Report (3).pdf',
    });
    expect(readFileSync(join(f.root, 'users/hari/Docs/Report.pdf'), 'utf8')).toBe('v1');
    expect(await freeName(join(f.root, 'users/hari/Docs'), 'Notes')).toBe('Notes (2)');
  });

  it('replace moves the old file to the Trash and the upload takes its name', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Docs/Report.pdf', 'old');
    const up = uploadClient(f.d.url, f.d);
    expect((await up.send('/home/Docs', 'Report.pdf', 'new', 'replace')).done).toMatchObject({ name: 'Report.pdf' });
    expect(readFileSync(join(f.root, 'users/hari/Docs/Report.pdf'), 'utf8')).toBe('new');
    const trashed = f.db.select().from(trashItems).all();
    expect(trashed).toMatchObject([{ ownerUserId: f.d.userId, originalPath: '/home/Docs/Report.pdf', size: 3 }]);
    expect(trashed[0]!.trashPath.startsWith(join(f.root, '.trash', f.d.userId))).toBe(true);
    expect(readFileSync(trashed[0]!.trashPath, 'utf8')).toBe('old');
    // The Trash never shows in Files.
    const top = f.data<{ items: Array<{ name: string }> }>(await f.d.query('files.list', { path: '/users' }));
    expect(top.items.map((i) => i.name)).not.toContain('.trash');
  });

  it('skip writes nothing; and when there is no conflict at the end, the choice does nothing', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Docs/Report.pdf', 'old');
    const up = uploadClient(f.d.url, f.d);
    expect((await up.send('/home/Docs', 'Report.pdf', 'new', 'skip')).done).toEqual({ skipped: true });
    expect(readFileSync(join(f.root, 'users/hari/Docs/Report.pdf'), 'utf8')).toBe('old');
    expect(existsSync(join(f.root, 'users/hari/Docs/.Report.pdf.hlabs-part'))).toBe(false);
    expect((await up.send('/home/Docs', 'Fresh.pdf', 'x', 'skip')).done).toMatchObject({ name: 'Fresh.pdf' });
  });
});
