// A person's own look (D-010, US-ACCT-32…35): the `appearance:<userId>` setting as auth.me shows it, changes from
// Settings › Appearance, and their own wallpaper photo at `<dataDir>/wallpapers/<userId>.<ext>`.
import { hlabsError, type Appearance } from '@hlabs/api';
import { getUserSetting, setUserSetting, WALLPAPER_EXTS, type HlabsDb } from '@hlabs/db';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Photos up to 10 MB (US-ACCT-32). */
export const WALLPAPER_MAX_BYTES = 10 * 1024 * 1024;
/** Kept at most this wide and tall (US-ACCT-32). */
export const WALLPAPER_MAX_PX = 3840;

export type WallpaperExt = (typeof WALLPAPER_EXTS)[number];

export const WALLPAPER_TYPES: Record<WallpaperExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Where the person's own wallpaper is kept. */
export const wallpaperDir = (dataDir: string) => join(dataDir, 'wallpapers');
export const wallpaperPath = (dataDir: string, userId: string, ext: WallpaperExt) =>
  join(wallpaperDir(dataDir), `${userId}.${ext}`);

/** The URL of the caller's own photo; `v` changes with each upload, so browsers can keep it for good. */
export const customWallpaperUrl = (uploadedAt: number) => `/api/appearance/wallpaper?v=${uploadedAt}`;

/** auth.me's `appearance`: the stored value, with the photo's URL and Dusk for a photo that's gone. */
export function appearanceFor(db: HlabsDb, userId: string): Appearance {
  const { customWallpaper, wallpaper, ...rest } = getUserSetting(db, 'appearance', userId);
  return {
    ...rest,
    wallpaper: wallpaper === 'custom' && !customWallpaper ? 'dusk' : wallpaper,
    customWallpaperUrl: customWallpaper ? customWallpaperUrl(customWallpaper.uploadedAt) : null,
  };
}

/** settings.appearance.update: only the fields sent change; their own photo only once there is one. */
export function updateAppearance(
  db: HlabsDb,
  userId: string,
  change: Partial<Omit<Appearance, 'customWallpaperUrl' | 'reduceMotion'>> & { reduceMotion?: boolean },
): void {
  const before = getUserSetting(db, 'appearance', userId);
  const defined = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
  if (defined.wallpaper === 'custom' && !before.customWallpaper) throw hlabsError('VALIDATION_FAILED');
  setUserSetting(db, 'appearance', userId, { ...before, ...defined });
}

/** The image format from the file's first bytes, whatever it was called or said it was: JPEG, PNG or WebP. */
export function sniffImage(bytes: Uint8Array): WallpaperExt | null {
  const at = (i: number, ...b: number[]) => b.every((x, k) => bytes[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return 'jpg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
  // "RIFF" <size> "WEBP"
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
  return null;
}

/**
 * Keeps an uploaded photo as the person's wallpaper (US-ACCT-32): checked by its bytes (JPEG, PNG or WebP, at most
 * 10 MB), turned upright, shrunk to fit 3840px (never enlarged) and stripped of its metadata (where it was taken),
 * in its own format. It replaces any photo they had and becomes their wallpaper. VALIDATION_FAILED for anything else.
 */
export async function saveWallpaper(
  deps: { db: HlabsDb; dataDir: string },
  userId: string,
  bytes: Buffer,
  now = Date.now(),
): Promise<Appearance> {
  if (bytes.length === 0 || bytes.length > WALLPAPER_MAX_BYTES) throw hlabsError('VALIDATION_FAILED');
  const ext = sniffImage(bytes);
  if (!ext) throw hlabsError('VALIDATION_FAILED');
  const { default: sharp } = await import('sharp');
  const dir = wallpaperDir(deps.dataDir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const out = wallpaperPath(deps.dataDir, userId, ext);
  const tmp = `${out}.${process.pid}.tmp`;
  try {
    const image = sharp(bytes, { animated: false })
      .rotate()
      .resize({ width: WALLPAPER_MAX_PX, height: WALLPAPER_MAX_PX, fit: 'inside', withoutEnlargement: true });
    const encoded =
      ext === 'jpg' ? image.jpeg({ quality: 88, mozjpeg: true }) : ext === 'png' ? image.png() : image.webp();
    await encoded.toFile(tmp);
  } catch {
    // Says it's an image but sharp can't read it.
    await rm(tmp, { force: true });
    throw hlabsError('VALIDATION_FAILED');
  }
  await rename(tmp, out);
  // A photo of another format they had before goes.
  for (const other of WALLPAPER_EXTS) {
    if (other !== ext) await rm(wallpaperPath(deps.dataDir, userId, other), { force: true });
  }
  const before = getUserSetting(deps.db, 'appearance', userId);
  setUserSetting(deps.db, 'appearance', userId, {
    ...before,
    wallpaper: 'custom',
    customWallpaper: { ext, uploadedAt: now },
  });
  return appearanceFor(deps.db, userId);
}

/** The person's own photo on disk, or null when they have none. */
export function customWallpaperFile(
  deps: { db: HlabsDb; dataDir: string },
  userId: string,
): { path: string; type: string } | null {
  const custom = getUserSetting(deps.db, 'appearance', userId).customWallpaper;
  if (!custom) return null;
  return { path: wallpaperPath(deps.dataDir, userId, custom.ext), type: WALLPAPER_TYPES[custom.ext] };
}
