// @vitest-environment node
// US-SITE-11 · Keep screenshots in the docs current: the docsShot helper's sizes and path, the bot's 1% rule, and the
// docs instance's data dir (D-177).
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { DOCS_DEVICES, DOCS_HOME } from '../instances';
import { docsShot, layoutOf, SHOT_SIZES, SHOTS_DIR, shotPath, toShotWebp } from './docs-shot';
import { CHANGE_THRESHOLD, classifyShot, pixelDiff } from './pixel-diff';

/** A plain image of `width` × `height`, as PNG. */
const solid = (width: number, height: number, colour = { r: 40, g: 30, b: 90 }) =>
  sharp({ create: { width, height, channels: 4, background: { ...colour, alpha: 1 } } })
    .png()
    .toBuffer();

/** That image with the first `pixels` pixels (row by row) painted white. */
async function withChangedPixels(width: number, height: number, pixels: number) {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) raw.set(i < pixels ? [255, 255, 255, 255] : [40, 30, 90, 255], i * 4);
  return sharp(raw, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

describe('US-SITE-11', () => {
  describe('docsShot', () => {
    it('saves into apps/site/src/assets/shots as <name>.webp', () => {
      expect(SHOTS_DIR).toBe(resolve(import.meta.dirname, '../../../site/src/assets/shots'));
      expect(shotPath('home')).toBe(join(SHOTS_DIR, 'home.webp'));
      expect(shotPath('app-store-phone')).toBe(join(SHOTS_DIR, 'app-store-phone.webp'));
      expect(() => shotPath('Home page')).toThrow();
      expect(() => shotPath('../home')).toThrow();
    });

    it('is 1440 × 900 on a computer, 390 × 844 on a phone and 1180 × 820 on a tablet', () => {
      expect(SHOT_SIZES).toEqual({
        desktop: { width: 1440, height: 900 },
        phone: { width: 390, height: 844 },
        tablet: { width: 1180, height: 820 },
      });
      for (const layout of ['desktop', 'phone', 'tablet'] as const) {
        expect(DOCS_DEVICES[layout].viewport).toEqual(SHOT_SIZES[layout]);
        expect(layoutOf(SHOT_SIZES[layout])).toBe(layout);
      }
      expect(() => layoutOf({ width: 412, height: 839 })).toThrow(/use 1440×900, 390×844 or 1180×820/);
    });

    it('writes a WebP of the layout size from the page', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'us-site-11-'));
      dirs.push(dir);
      const png = await solid(390, 844);
      const page = {
        viewportSize: () => ({ width: 390, height: 844 }),
        evaluate: async () => undefined,
        waitForTimeout: async () => undefined,
        screenshot: async () => png,
      };
      const path = await docsShot(page as never, 'home-phone', { dir });
      expect(path).toBe(join(dir, 'home-phone.webp'));
      const meta = await sharp(await readFile(path)).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 390, height: 844 });
      await expect(docsShot(page as never, 'home-phone', { dir, layout: 'desktop' })).rejects.toThrow(/phone size/);
    });

    it("refuses a screenshot that isn't the layout's size", async () => {
      await expect(toShotWebp(await solid(780, 1688), SHOT_SIZES.phone)).rejects.toThrow(/780×1688/);
    });
  });

  describe('the bot opens a pull request only for more than 1% of pixels changed', () => {
    const W = 100;
    const H = 100;

    it('counts the pixels that changed', async () => {
      const diff = await pixelDiff(await solid(W, H), await withChangedPixels(W, H, 250));
      expect(diff).toEqual({ changed: 250, total: 10_000, ratio: 0.025 });
    });

    it('ignores tiny colour noise, as WebP compression makes', async () => {
      const diff = await pixelDiff(await solid(W, H), await solid(W, H, { r: 44, g: 27, b: 95 }));
      expect(diff.changed).toBe(0);
    });

    it('keeps the committed image at 1% or less, proposes the new one above it', async () => {
      expect(CHANGE_THRESHOLD).toBe(0.01);
      const before = await solid(W, H);
      expect(await classifyShot(before, await withChangedPixels(W, H, 100))).toEqual({
        kind: 'unchanged',
        ratio: 0.01,
      });
      expect(await classifyShot(before, await withChangedPixels(W, H, 101))).toEqual({
        kind: 'changed',
        ratio: 0.0101,
      });
      expect(await classifyShot(null, before)).toEqual({ kind: 'new' });
    });

    it('treats a different size as changed', async () => {
      expect(await classifyShot(await solid(W, H), await solid(W, H + 1))).toMatchObject({ kind: 'changed', ratio: 1 });
    });

    it('compares WebP files as saved', async () => {
      const a = await toShotWebp(await solid(390, 844), SHOT_SIZES.phone);
      const b = await toShotWebp(await solid(390, 844), SHOT_SIZES.phone);
      expect(await classifyShot(a, b)).toEqual({ kind: 'unchanged', ratio: 0 });
    });
  });

  // The data set itself is checked in apps/daemon/test/us-site-11.test.ts.
  describe('the docs instance', () => {
    it('lives in its own pretend home, never a dev or e2e data dir', () => {
      expect(DOCS_HOME.endsWith('/.e2e-data-docs/home')).toBe(true);
      expect(DOCS_HOME).not.toContain('.dev-data');
    });
  });
});
