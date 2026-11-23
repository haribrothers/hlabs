// US-ACCT-32 · Choose a wallpaper (server side): settings.appearance.update saves the choice per account, and
// POST /api/appearance/wallpaper keeps the person's own photo (checked by its bytes, at most 10 MB, at most 3840px),
// served back only to them.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { sniffImage } from '../src/account/appearance';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Daemon = Awaited<ReturnType<typeof daemonWithAdmin>>;
type Appearance = { wallpaper: string; customWallpaperUrl: string | null };

const photo = (width: number, height: number, format: 'png' | 'jpeg' | 'webp' = 'png') =>
  sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } })
    .toFormat(format)
    .toBuffer();

const upload = (d: Daemon, body: Buffer | string, headers: Record<string, string> = {}) =>
  fetch(`${d.url}/api/appearance/wallpaper`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', cookie: d.cookie, 'x-hlabs-csrf': d.csrf, ...headers },
    body,
  });

const appearance = async (d: Daemon) =>
  ((await d.query('auth.me')).result!.data as { appearance: Appearance }).appearance;

describe('US-ACCT-32', () => {
  it('Dusk by default; picking Ocean or Forest is saved for the account', async () => {
    const d = await daemonWithAdmin(closers);
    expect(await appearance(d)).toMatchObject({ wallpaper: 'dusk', customWallpaperUrl: null });
    expect((await d.mutate('settings.appearance.update', { wallpaper: 'ocean' })).result?.data).toEqual({ ok: true });
    expect((await appearance(d)).wallpaper).toBe('ocean');
    await d.mutate('settings.appearance.update', { wallpaper: 'forest' });
    expect((await appearance(d)).wallpaper).toBe('forest');
  });

  it('refuses an unknown wallpaper, and "custom" before a photo is uploaded', async () => {
    const d = await daemonWithAdmin(closers);
    for (const wallpaper of ['sky', 'custom']) {
      expect((await d.mutate('settings.appearance.update', { wallpaper })).error?.data.hlabsCode).toBe(
        'VALIDATION_FAILED',
      );
    }
    expect((await appearance(d)).wallpaper).toBe('dusk');
  });

  it('an uploaded photo becomes the wallpaper, shrunk to 3840px, and only its owner can fetch it', async () => {
    const d = await daemonWithAdmin(closers);
    const res = await upload(d, await photo(5000, 2000));
    expect(res.status).toBe(200);
    const saved = ((await res.json()) as { appearance: Appearance }).appearance;
    expect(saved.wallpaper).toBe('custom');
    expect(saved.customWallpaperUrl).toMatch(/^\/api\/appearance\/wallpaper\?v=\d+$/);
    expect(await appearance(d)).toMatchObject(saved);

    const dir = join(d.config.paths.dataDir, 'wallpapers');
    expect(readdirSync(dir)).toEqual([`${d.userId}.png`]);
    const meta = await sharp(join(dir, `${d.userId}.png`)).metadata();
    expect([meta.width, meta.height]).toEqual([3840, 1536]);

    const mine = await fetch(`${d.url}${saved.customWallpaperUrl}`, { headers: { cookie: d.cookie } });
    expect(mine.status).toBe(200);
    expect(mine.headers.get('content-type')).toBe('image/png');
    expect(mine.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(sniffImage(new Uint8Array(await mine.arrayBuffer()))).toBe('png');

    // Someone else gets their own (none), never this one; nobody signed out gets anything.
    const anu = await memberSession(d);
    expect((await fetch(`${d.url}${saved.customWallpaperUrl}`, { headers: { cookie: anu.cookie } })).status).toBe(404);
    expect((await fetch(`${d.url}${saved.customWallpaperUrl}`)).status).toBe(401);

    // Back to Dusk and to the photo again, without uploading it twice.
    await d.mutate('settings.appearance.update', { wallpaper: 'dusk' });
    expect(await appearance(d)).toMatchObject({ wallpaper: 'dusk', customWallpaperUrl: saved.customWallpaperUrl });
    await d.mutate('settings.appearance.update', { wallpaper: 'custom' });
    expect((await appearance(d)).wallpaper).toBe('custom');
  });

  it('a new photo replaces the old one with a new address, in its own format', async () => {
    const d = await daemonWithAdmin(closers);
    const first = ((await (await upload(d, await photo(800, 600))).json()) as { appearance: Appearance }).appearance;
    await new Promise((r) => setTimeout(r, 5));
    const second = ((await (await upload(d, await photo(800, 600, 'jpeg'))).json()) as { appearance: Appearance })
      .appearance;
    expect(second.customWallpaperUrl).not.toBe(first.customWallpaperUrl);
    expect(readdirSync(join(d.config.paths.dataDir, 'wallpapers'))).toEqual([`${d.userId}.jpg`]);
    const webp = await upload(d, await photo(800, 600, 'webp'));
    expect(webp.status).toBe(200);
    expect(readdirSync(join(d.config.paths.dataDir, 'wallpapers'))).toEqual([`${d.userId}.webp`]);
  });

  it('refuses what is not a JPEG, PNG or WebP by its bytes, whatever its type says, and anything over 10 MB', async () => {
    const d = await daemonWithAdmin(closers);
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    // A text file called a PNG, a GIF, and PNG magic bytes with nothing readable after them.
    const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    for (const body of [Buffer.from('hello'), gif, fakePng]) {
      const res = await upload(d, body, { 'content-type': 'image/png' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ hlabsCode: 'VALIDATION_FAILED', detail: null });
    }
    const big = Buffer.concat([await photo(10, 10), Buffer.alloc(10 * 1024 * 1024)]);
    const tooBig = await upload(d, big);
    expect(tooBig.status).toBe(413);
    expect(((await tooBig.json()) as { hlabsCode: string }).hlabsCode).toBe('VALIDATION_FAILED');
    expect(await appearance(d)).toMatchObject({ wallpaper: 'dusk', customWallpaperUrl: null });
    expect(existsSync(join(d.config.paths.dataDir, 'wallpapers', `${d.userId}.png`))).toBe(false);
  });

  it('needs a session and the CSRF header', async () => {
    const d = await daemonWithAdmin(closers);
    const body = await photo(10, 10);
    expect((await upload(d, body, { 'x-hlabs-csrf': 'wrong' })).status).toBe(403);
    const anonymous = await fetch(`${d.url}/api/appearance/wallpaper`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body,
    });
    expect(anonymous.status).toBe(401);
    expect((await appearance(d)).wallpaper).toBe('dusk');
  });

  it("is per account: a member's choice doesn't change the admin's", async () => {
    const d = await daemonWithAdmin(closers);
    const anu = await memberSession(d);
    expect((await anu.mutate('settings.appearance.update', { wallpaper: 'forest' })).status).toBe(200);
    expect(((await anu.query('auth.me')).result!.data as { appearance: Appearance }).appearance.wallpaper).toBe(
      'forest',
    );
    expect((await appearance(d)).wallpaper).toBe('dusk');
  });
});
