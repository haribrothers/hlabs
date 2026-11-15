// US-FILE-08 · Upload files with progress (server side): an upload is a session and chunks; the partial file never
// shows; it lands under its name when done; not enough space, read-only places, other people's places, bad names and
// a missing CSRF header are refused.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Uploads } from '../src/files/uploads';
import { filesDaemon, uploadClient } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-FILE-08', () => {
  it('uploads in chunks; the partial file stays hidden until the last one, then the file is in the folder', async () => {
    const f = await filesDaemon(closers);
    const up = uploadClient(f.d.url, f.d);
    const made = await up.create({ path: '/home/Documents', name: 'Tax return 2025.pdf', size: 10 });
    expect(made.status).toBe(200);
    const { id, offset } = (await made.json()) as { id: string; offset: number };
    expect(offset).toBe(0);
    const first = await up.chunk(id, 0, '01234');
    expect(await first.json()).toEqual({ offset: 5, done: null });
    expect(first.headers.get('upload-offset')).toBe('5');
    const listing = f.data<{ items: Array<{ name: string }> }>(
      await f.d.query('files.list', { path: '/home/Documents' }),
    );
    expect(listing.items).toEqual([]);
    const last = await up.chunk(id, 5, '56789');
    expect(await last.json()).toEqual({
      offset: 10,
      done: { path: '/home/Documents/Tax return 2025.pdf', name: 'Tax return 2025.pdf' },
    });
    expect(readFileSync(join(f.root, 'users/hari/Documents/Tax return 2025.pdf'), 'utf8')).toBe('0123456789');
    expect(f.data<{ uploads: unknown[] }>(await f.d.query('files.uploads')).uploads).toEqual([]);
    // An empty file needs no chunk bytes.
    expect(await up.send('/home', 'empty.txt', '')).toEqual({
      offset: 0,
      done: { path: '/home/empty.txt', name: 'empty.txt' },
    });
  });

  it('a file bigger than the free space less 1 GB is FILES_NO_SPACE and nothing is written', async () => {
    const f = await filesDaemon(closers);
    const s = f.d.services!;
    const uploads = new Uploads({ db: s.db, files: s.files, trash: s.trash, freeBytes: async () => 1_500_000_000 });
    const caller = s.files.caller(f.d.userId, 'admin');
    await expect(uploads.create(caller, { path: '/home', name: 'big.mov', size: 600_000_000 })).rejects.toMatchObject({
      cause: { hlabsCode: 'FILES_NO_SPACE' },
    });
    expect(await uploads.create(caller, { path: '/home', name: 'ok.mov', size: 400_000_000 })).toMatchObject({
      offset: 0,
    });
  });

  it("read-only places, other people's places, bad names and no CSRF header are refused", async () => {
    const f = await filesDaemon(closers);
    const admin = uploadClient(f.d.url, f.d);
    const anu = uploadClient(f.d.url, f.anu);
    const code = async (r: Response) => [r.status, ((await r.json()) as { hlabsCode: string }).hlabsCode];
    expect(await code(await admin.create({ path: '/users', name: 'a', size: 1 }))).toEqual([403, 'FILES_READ_ONLY']);
    expect(await code(await anu.create({ path: '/shared', name: 'a', size: 1 }))).toEqual([403, 'FILES_ACCESS_DENIED']);
    expect(await code(await admin.create({ path: '/home', name: 'a/b', size: 1 }))).toEqual([
      400,
      'FILES_INVALID_NAME',
    ]);
    expect(await code(await admin.create({ path: '/home/nope', name: 'a', size: 1 }))).toEqual([404, 'NOT_FOUND']);
    const noCsrf = uploadClient(f.d.url, { cookie: f.d.cookie, csrf: 'wrong' });
    expect(await code(await noCsrf.create({ path: '/home', name: 'a', size: 1 }))).toEqual([403, 'CSRF_REJECTED']);
    // Anu can't write to Hari's upload either.
    const { id } = (await (await admin.create({ path: '/home', name: 'mine.txt', size: 3 })).json()) as { id: string };
    expect((await anu.chunk(id, 0, 'abc')).status).toBe(404);
    expect((await fetch(`${f.d.url}/api/files/upload`, { method: 'POST' })).status).toBe(401);
  });
});
