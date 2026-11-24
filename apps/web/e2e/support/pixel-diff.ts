// How much a docs screenshot changed (US-SITE-11, D-177): the share of pixels that differ between the committed image
// and a new one. A pixel counts when any channel moved by more than `tolerance` (WebP's own noise and anti-aliasing
// stay under it); images of different sizes changed entirely. The docs-shots bot proposes an image only when more
// than 1% of its pixels changed. Runs in Node (the e2e run, scripts/docs-shots-compare.ts and unit tests): no
// relative imports, so Node can run it as it is.
import sharp from 'sharp';

/** More than this share of pixels changed: the bot proposes the new image. */
export const CHANGE_THRESHOLD = 0.01;
/** A channel moving by this much or less (of 255) isn't a change. */
export const PIXEL_TOLERANCE = 24;

export interface PixelDiff {
  changed: number;
  total: number;
  /** changed / total, 0…1. */
  ratio: number;
}

async function rgba(image: Buffer) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** The pixels that differ between two images (any format sharp reads: WebP, PNG…). */
export async function pixelDiff(before: Buffer, after: Buffer, tolerance = PIXEL_TOLERANCE): Promise<PixelDiff> {
  const [a, b] = await Promise.all([rgba(before), rgba(after)]);
  if (a.width !== b.width || a.height !== b.height) {
    const total = Math.max(a.width * a.height, b.width * b.height);
    return { changed: total, total, ratio: 1 };
  }
  const total = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i]! - b.data[i]!) > tolerance ||
      Math.abs(a.data[i + 1]! - b.data[i + 1]!) > tolerance ||
      Math.abs(a.data[i + 2]! - b.data[i + 2]!) > tolerance ||
      Math.abs(a.data[i + 3]! - b.data[i + 3]!) > tolerance
    ) {
      changed++;
    }
  }
  return { changed, total, ratio: total === 0 ? 0 : changed / total };
}

export type ShotChange = { kind: 'new' } | { kind: 'changed'; ratio: number } | { kind: 'unchanged'; ratio: number };

/** What the bot does with a new screenshot: propose it (new, or more than 1% changed) or keep the committed one. */
export async function classifyShot(before: Buffer | null, after: Buffer): Promise<ShotChange> {
  if (!before) return { kind: 'new' };
  const { ratio } = await pixelDiff(before, after);
  return ratio > CHANGE_THRESHOLD ? { kind: 'changed', ratio } : { kind: 'unchanged', ratio };
}
