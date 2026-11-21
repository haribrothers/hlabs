// US-FILE-02 · Browse a folder in grid view (server side): folders first then files, each A to Z; child counts and
// sizes; pages of 200; hidden files and partial uploads left out; a folder that's gone; image thumbnails.
import { mkdirSync, rmSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Item = {
  name: string;
  path: string;
  kind: string;
  size: number | null;
  childCount: number | null;
  mime: string | null;
  previewUrl: string | null;
};
type Listing = { items: Item[]; nextCursor: string | null; count: number; filesBytes: number };

describe('US-FILE-02', () => {
  it('folders first, then files, each A to Z (numbers in order); folders count their items, files their size', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Work/a.txt');
    f.put('users/hari/Documents/Work/b.txt');
    f.put('users/hari/Documents/Work/.hidden');
    f.put('users/hari/Documents/bills/x.pdf');
    mkdirSync(join(f.root, 'users/hari/Documents/Taxes'), { recursive: true });
    f.put('users/hari/Documents/Lease agreement.pdf', 'x'.repeat(1_200));
    f.put('users/hari/Documents/budget 2026.xlsx', 'x'.repeat(84));
    f.put('users/hari/Documents/file 10.txt', 'x');
    f.put('users/hari/Documents/file 9.txt', 'x');
    f.put('users/hari/Documents/.DS_Store', 'x');
    f.put('users/hari/Documents/.Movie.mov.hlabs-part', 'x');
    const list = f.data<Listing>(await f.d.query('files.list', { path: '/home/Documents' }));
    expect(list.items.map((i) => [i.name, i.kind, i.childCount, i.size])).toEqual([
      ['bills', 'folder', 1, null],
      ['Taxes', 'folder', 0, null],
      ['Work', 'folder', 2, null],
      ['budget 2026.xlsx', 'file', null, 84],
      ['file 9.txt', 'file', null, 1],
      ['file 10.txt', 'file', null, 1],
      ['Lease agreement.pdf', 'file', null, 1_200],
    ]);
    expect(list.items.find((i) => i.name === 'Lease agreement.pdf')).toMatchObject({
      path: '/home/Documents/Lease agreement.pdf',
      mime: 'application/pdf',
      previewUrl: null,
    });
    expect(list.count).toBe(7);
    expect(list.filesBytes).toBe(1_286);
    expect(list.nextCursor).toBeNull();
  });

  it('a big folder comes in pages of 200; count and size cover all of it', async () => {
    const f = await filesDaemon(closers);
    for (let i = 0; i < 450; i++) f.put(`users/hari/Many/f${String(i).padStart(3, '0')}.txt`, 'ab');
    const first = f.data<Listing>(await f.d.query('files.list', { path: '/home/Many' }));
    expect(first.items).toHaveLength(200);
    expect(first.items[0]!.name).toBe('f000.txt');
    expect(first).toMatchObject({ nextCursor: '200', count: 450, filesBytes: 900 });
    const second = f.data<Listing>(await f.d.query('files.list', { path: '/home/Many', cursor: '200' }));
    expect(second.items[0]!.name).toBe('f200.txt');
    const third = f.data<Listing>(await f.d.query('files.list', { path: '/home/Many', cursor: '400' }));
    expect(third.items).toHaveLength(50);
    expect(third.nextCursor).toBeNull();
  });

  it('a folder that no longer exists is NOT_FOUND; a file is not a folder', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Gone/a.txt');
    expect(f.data<Listing>(await f.d.query('files.list', { path: '/home/Gone' })).count).toBe(1);
    rmSync(join(f.root, 'users/hari/Gone'), { recursive: true });
    expect(f.code(await f.d.query('files.list', { path: '/home/Gone' }))).toBe('NOT_FOUND');
    f.put('users/hari/note.txt');
    expect(f.code(await f.d.query('files.list', { path: '/home/note.txt' }))).toBe('FILES_INVALID_PATH');
  });

  it('photos get a signed preview link; ?w=256 is a thumbnail made once and kept by path and change time', async () => {
    const f = await filesDaemon(closers);
    const big = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#a050f0' } })
      .jpeg()
      .toBuffer();
    f.put('users/hari/Photos/Kitchen plan.jpg', big);
    f.put('users/hari/Photos/Clip.mp4', 'not really a video');
    f.put('users/hari/Photos/notes.txt', 'hello');
    const items = f.data<Listing>(await f.d.query('files.list', { path: '/home/Photos' })).items;
    const photo = items.find((i) => i.name === 'Kitchen plan.jpg')!;
    expect(photo.previewUrl).toMatch(/^\/api\/files\/preview\/[\w-]+\.[\w-]+$/);
    expect(items.find((i) => i.name === 'Clip.mp4')!.previewUrl).toMatch(/^\/api\/files\/preview\//);
    expect(items.find((i) => i.name === 'notes.txt')!.previewUrl).toBeNull();

    const get = (url: string, cookie = f.d.cookie) => fetch(`${f.d.url}${url}`, { headers: { cookie } });
    const thumb = await get(`${photo.previewUrl}?w=256`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([256, 171]);
    const thumbs = join(f.d.services!.config.paths.dataDir, 'cache', 'thumbs');
    expect(readdirSync(thumbs)).toHaveLength(1);
    await get(`${photo.previewUrl}?w=256`);
    expect(readdirSync(thumbs)).toHaveLength(1);
    // The link is for Hari only: Anu's session gets nothing.
    expect((await get(`${photo.previewUrl}?w=256`, f.anu.cookie)).status).toBe(403);
    expect((await get(`${photo.previewUrl}?w=256`, '')).status).toBe(401);
  });
});
