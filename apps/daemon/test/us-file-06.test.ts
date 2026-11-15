// US-FILE-06 · Preview a file (server side): files.preview signs a link for 5 minutes and one person; an expired link
// is 410; text is its first 1 MB as plain text; SVGs are sandboxed; videos seek with Range; files.stat reads image
// and MP4 dimensions.
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { PREVIEW_TTL_MS } from '../src/files/preview-tokens';
import { TEXT_PREVIEW_BYTES } from '../src/http/files';
import { filesDaemon } from './files-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** A box: size, type, body. */
const box = (type: string, ...body: Buffer[]) => {
  const inner = Buffer.concat(body);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + inner.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, inner]);
};

/** A version-0 tkhd (84-byte body) with width and height in 16.16 at its end. */
function tkhd(width: number, height: number) {
  const body = Buffer.alloc(84);
  body.writeUInt32BE(width << 16, 76);
  body.writeUInt32BE(height << 16, 80);
  return box('tkhd', body);
}

/** An MP4 whose moov comes after its media, as many cameras write them: a sound track first, then the video. */
const mp4 = (width: number, height: number) =>
  Buffer.concat([
    box('ftyp', Buffer.from('isom0000')),
    box('mdat', Buffer.alloc(64)),
    box('moov', box('mvhd', Buffer.alloc(100)), box('trak', tkhd(0, 0)), box('trak', tkhd(width, height))),
  ]);

describe('US-FILE-06', () => {
  it('a preview link is for 5 minutes and this person; once expired it is 410', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/Documents/Lease.pdf', '%PDF-1.7');
    const before = Date.now();
    const link = f.data<{ url: string; expiresAt: number }>(
      await f.d.query('files.preview', { path: '/home/Documents/Lease.pdf' }),
    );
    expect(link.url).toMatch(/^\/api\/files\/preview\/[\w-]+\.[\w-]+$/);
    expect(link.expiresAt - before).toBeGreaterThanOrEqual(PREVIEW_TTL_MS - 1000);
    expect(link.expiresAt - before).toBeLessThanOrEqual(PREVIEW_TTL_MS + 1000);
    const pdf = await fetch(`${f.d.url}${link.url}`, { headers: { cookie: f.d.cookie } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(pdf.headers.get('content-disposition')).toBe(`inline; filename="Lease.pdf"; filename*=UTF-8''Lease.pdf`);
    // A link made 6 minutes ago.
    const { token } = f.d.services!.files.tokens.sign(f.d.userId, '/home/Documents/Lease.pdf', Date.now() - 6 * 60_000);
    const old = await fetch(`${f.d.url}/api/files/preview/${token}`, { headers: { cookie: f.d.cookie } });
    expect(old.status).toBe(410);
    // A forged one.
    expect((await fetch(`${f.d.url}/api/files/preview/${token}x`, { headers: { cookie: f.d.cookie } })).status).toBe(
      403,
    );
    // Folders and places a person can't reach get no link.
    expect(f.code(await f.d.query('files.preview', { path: '/home/Documents' }))).toBe('FILES_INVALID_PATH');
    expect(f.code(await f.anu.query('files.preview', { path: '/users/hari/Documents/Lease.pdf' }))).toBe(
      'FILES_ACCESS_DENIED',
    );
  });

  it('text shows its first 1 MB, always as plain text; SVGs are sandboxed; videos seek', async () => {
    const f = await filesDaemon(closers);
    f.put('users/hari/big.log', 'a'.repeat(TEXT_PREVIEW_BYTES + 10));
    f.put('users/hari/page.html', '<script>alert(1)</script>');
    f.put('users/hari/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    f.put('users/hari/clip.mp4', mp4(1920, 1080));
    const open = async (path: string, headers: Record<string, string> = {}) => {
      const { url } = f.data<{ url: string }>(await f.d.query('files.preview', { path }));
      return fetch(`${f.d.url}${url}`, { headers: { cookie: f.d.cookie, ...headers } });
    };
    const log = await open('/home/big.log');
    expect(log.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(log.headers.get('x-hlabs-truncated')).toBe('1');
    expect((await log.text()).length).toBe(TEXT_PREVIEW_BYTES);
    const html = await open('/home/page.html');
    expect(html.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(html.headers.get('x-hlabs-truncated')).toBe('0');
    const svg = await open('/home/logo.svg');
    expect(svg.headers.get('content-type')).toBe('image/svg+xml');
    expect(svg.headers.get('content-security-policy')).toBe('sandbox');
    const clip = await open('/home/clip.mp4', { range: 'bytes=0-3' });
    expect(clip.status).toBe(206);
    expect(clip.headers.get('content-type')).toBe('video/mp4');
  });

  it('details: image dimensions (sideways photos turned), MP4 dimensions, none for other files', async () => {
    const f = await filesDaemon(closers);
    f.put(
      'users/hari/wide.png',
      await sharp({ create: { width: 640, height: 480, channels: 3, background: '#fff' } })
        .png()
        .toBuffer(),
    );
    f.put(
      'users/hari/portrait.jpg',
      await sharp({ create: { width: 400, height: 300, channels: 3, background: '#000' } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer(),
    );
    f.put('users/hari/clip.mp4', mp4(1920, 1080));
    f.put('users/hari/broken.jpg', 'not a jpeg');
    f.put('users/hari/Notes/a.txt', 'x');
    const stat = async (path: string) =>
      f.data<{ dimensions: unknown; parent: unknown; size: number | null }>(await f.d.query('files.stat', { path }));
    expect((await stat('/home/wide.png')).dimensions).toEqual({ width: 640, height: 480 });
    expect((await stat('/home/portrait.jpg')).dimensions).toEqual({ width: 300, height: 400 });
    expect((await stat('/home/clip.mp4')).dimensions).toEqual({ width: 1920, height: 1080 });
    expect((await stat('/home/broken.jpg')).dimensions).toBeNull();
    const note = await stat('/home/Notes/a.txt');
    expect(note).toMatchObject({ dimensions: null, size: 1 });
    expect(note.parent).toEqual([
      { path: '/home', name: null },
      { path: '/home/Notes', name: 'Notes' },
    ]);
  });
});
