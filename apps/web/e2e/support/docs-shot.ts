// Screenshots for the help, taken from the real dashboard (US-SITE-11, D-177). A spec in e2e/docs-shots calls
// `docsShot(page, '<name>')` once the screen shows what the help describes; it saves
// apps/site/src/assets/shots/<name>.webp at the size of its layout: 1440 × 900 on a computer, 390 × 844 on a phone and
// 1180 × 820 on a tablet (D-175). The page's viewport must be exactly that size. Run them with
// `pnpm --filter @hlabs/web exec playwright test --project=docs-shots` (developers/docs-screenshots).
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import sharp from 'sharp';

export type ShotLayout = 'desktop' | 'phone' | 'tablet';

/** Each layout's screenshot, in pixels (one CSS pixel each). */
export const SHOT_SIZES: Record<ShotLayout, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
  tablet: { width: 1180, height: 820 },
};

/** Where the website keeps them: Astro sizes and serves them from here. */
export const SHOTS_DIR = resolve(import.meta.dirname, '../../../site/src/assets/shots');

/** WebP quality: sharp enough for text, a fraction of PNG's size. */
export const SHOT_QUALITY = 88;

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `<dir>/<name>.webp`; names are lowercase words joined by dashes (`home`, `files-phone`). */
export function shotPath(name: string, dir = SHOTS_DIR): string {
  if (!NAME.test(name)) throw new Error(`docsShot: "${name}" isn't a name like "app-store-phone"`);
  return join(dir, `${name}.webp`);
}

/** The layout a viewport is exactly the size of. */
export function layoutOf(viewport: { width: number; height: number } | null): ShotLayout {
  const match = (Object.keys(SHOT_SIZES) as ShotLayout[]).find(
    (l) => SHOT_SIZES[l].width === viewport?.width && SHOT_SIZES[l].height === viewport?.height,
  );
  if (!match) {
    throw new Error(
      `docsShot: the viewport is ${viewport?.width}×${viewport?.height}; use 1440×900, 390×844 or 1180×820`,
    );
  }
  return match;
}

/** A PNG screenshot as the WebP the site uses, checked to be `size`. */
export async function toShotWebp(png: Buffer, size: { width: number; height: number }): Promise<Buffer> {
  const image = sharp(png);
  const { width, height } = await image.metadata();
  if (width !== size.width || height !== size.height) {
    throw new Error(`docsShot: the screenshot is ${width}×${height}, not ${size.width}×${size.height}`);
  }
  return image.webp({ quality: SHOT_QUALITY, effort: 6, smartSubsample: true }).toBuffer();
}

export interface DocsShotOptions {
  /** Checked against the viewport (inferred from it when not given). */
  layout?: ShotLayout;
  /** Parts to cover with a plain box (anything that can't be made steady). */
  mask?: Locator[];
  /** Another folder (unit tests). */
  dir?: string;
}

type ShotPage = Pick<Page, 'viewportSize' | 'evaluate' | 'screenshot' | 'waitForTimeout'>;

/** Saves the page as it is now as `<name>.webp` for the help, and returns the file's path. */
export async function docsShot(page: ShotPage, name: string, opts: DocsShotOptions = {}): Promise<string> {
  const path = shotPath(name, opts.dir);
  const layout = layoutOf(page.viewportSize());
  if (opts.layout && opts.layout !== layout) {
    throw new Error(`docsShot: "${name}" is a ${opts.layout} shot, but the viewport is the ${layout} size`);
  }
  // Fonts and the images on screen in (a lazy one out of sight may never load), for at most 5 s: timed here, not in the
  // page, whose clock the specs hold still.
  const loaded = page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((i) => !i.complete && i.getBoundingClientRect().top < window.innerHeight)
        .map(
          (i) =>
            new Promise((r) => {
              i.addEventListener('load', r);
              i.addEventListener('error', r);
            }),
        ),
    );
  });
  await Promise.race([loaded.catch(() => undefined), page.waitForTimeout(5_000)]);
  // No focus ring left by the last click.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.waitForTimeout(400);
  const png = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    ...(opts.mask ? { mask: opts.mask } : {}),
  });
  const webp = await toShotWebp(png, SHOT_SIZES[layout]);
  await mkdir(opts.dir ?? SHOTS_DIR, { recursive: true });
  await writeFile(path, webp);
  return path;
}
