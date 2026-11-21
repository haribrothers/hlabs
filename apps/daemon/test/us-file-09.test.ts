// US-FILE-09 · Pause, resume and cancel uploads (server side): HEAD says where the server is; a chunk at the wrong
// offset is refused with the right one; picking the same file again resumes; bytes a dropped chunk left are cut;
// cancel removes the partial file; a second tab is refused; idle sessions go after 24 hours.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IDLE_MS, partName } from '../src/files/uploads';
import { filesDaemon, uploadClient } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-FILE-09', () => {
  it('Resume asks for the offset and goes on from there; a wrong offset is refused with the right one', async () => {
    const f = await filesDaemon(closers);
    const up = uploadClient(f.d.url, f.d);
    const { id } = (await (await up.create({ path: '/home', name: 'Home video.mov', size: 9 })).json()) as {
      id: string;
    };
    await up.chunk(id, 0, 'abc');
    const head = await up.head(id);
    expect([head.status, head.headers.get('upload-offset'), head.headers.get('upload-length')]).toEqual([
      200,
      '3',
      '9',
    ]);
    const wrong = await up.chunk(id, 0, 'abc');
    expect([wrong.status, await wrong.json()]).toEqual([
      409,
      { hlabsCode: 'UPLOAD_OFFSET_MISMATCH', detail: { offset: 3 } },
    ]);
    await up.chunk(id, 3, 'def');
    await up.chunk(id, 6, 'ghi');
    expect(readFileSync(join(f.root, 'users/hari/Home video.mov'), 'utf8')).toBe('abcdefghi');
  });

  it('after a reload, the same file in the same folder resumes from the stored offset; another size starts again', async () => {
    const f = await filesDaemon(closers);
    const up = uploadClient(f.d.url, f.d);
    const first = (await (await up.create({ path: '/home', name: 'clip.mp4', size: 6 })).json()) as { id: string };
    await up.chunk(first.id, 0, 'abc');
    // A chunk cut off part way left bytes the server never counted.
    writeFileSync(join(f.root, 'users/hari', partName('clip.mp4')), 'abcXX');
    expect(
      f.data<{ uploads: Array<{ name: string; received: number }> }>(await f.d.query('files.uploads')).uploads,
    ).toMatchObject([{ name: 'clip.mp4', path: '/home', size: 6, received: 3 }]);
    const again = (await (await up.create({ path: '/home', name: 'clip.mp4', size: 6 })).json()) as {
      id: string;
      offset: number;
    };
    expect(again).toEqual({ id: first.id, offset: 3 });
    await up.chunk(again.id, 3, 'def');
    expect(readFileSync(join(f.root, 'users/hari/clip.mp4'), 'utf8')).toBe('abcdef');
    // A different size is a different file: a new session from 0.
    const other = (await (await up.create({ path: '/home', name: 'b.bin', size: 4 })).json()) as { id: string };
    await up.chunk(other.id, 0, 'ab');
    const bigger = (await (await up.create({ path: '/home', name: 'b.bin', size: 8 })).json()) as {
      id: string;
      offset: number;
    };
    expect(bigger.offset).toBe(0);
    expect(bigger.id).not.toBe(other.id);
  });

  it('Cancel removes the session and its partial file; finished files stay', async () => {
    const f = await filesDaemon(closers);
    const up = uploadClient(f.d.url, f.d);
    await up.send('/home', 'done.txt', 'kept');
    const { id } = (await (await up.create({ path: '/home', name: 'half.txt', size: 4 })).json()) as { id: string };
    await up.chunk(id, 0, 'ha');
    const part = join(f.root, 'users/hari', partName('half.txt'));
    expect(existsSync(part)).toBe(true);
    expect((await up.cancel(id)).status).toBe(200);
    expect(existsSync(part)).toBe(false);
    expect(existsSync(join(f.root, 'users/hari/done.txt'))).toBe(true);
    expect((await up.head(id)).status).toBe(404);
  });

  it('a second tab sending the same upload while one is sending is refused', async () => {
    const f = await filesDaemon(closers);
    const up = uploadClient(f.d.url, f.d);
    const { id } = (await (await up.create({ path: '/home', name: 'slow.bin', size: 4 })).json()) as { id: string };
    let release!: () => void;
    const slow = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1]));
        release = () => c.close();
      },
    });
    const first = fetch(`${f.d.url}/api/files/upload/${id}`, {
      method: 'PATCH',
      headers: {
        cookie: f.d.cookie,
        'x-hlabs-csrf': f.d.csrf,
        'content-type': 'application/offset+octet-stream',
        'upload-offset': '0',
      },
      body: slow,
      duplex: 'half',
    } as RequestInit);
    await new Promise((r) => setTimeout(r, 200));
    const second = await up.chunk(id, 0, 'abcd');
    expect([second.status, ((await second.json()) as { hlabsCode: string }).hlabsCode]).toEqual([
      409,
      'UPLOAD_IN_PROGRESS',
    ]);
    release();
    expect(((await (await first).json()) as { offset: number }).offset).toBe(1);
  });

  it('a session with no chunk for 24 hours is removed with its partial file', async () => {
    const f = await filesDaemon(closers);
    const up = uploadClient(f.d.url, f.d);
    const { id } = (await (await up.create({ path: '/home', name: 'old.bin', size: 4 })).json()) as { id: string };
    await up.chunk(id, 0, 'ab');
    const part = join(f.root, 'users/hari', partName('old.bin'));
    const { uploads } = f.d.services!;
    expect(await uploads.sweep(Date.now() + IDLE_MS - 60_000)).toBe(0);
    expect(await uploads.sweep(Date.now() + IDLE_MS + 60_000)).toBe(1);
    expect(existsSync(part)).toBe(false);
    expect((await up.head(id)).status).toBe(404);
  });
});
