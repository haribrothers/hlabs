// The installable dashboard's icons (US-INST-28), rendered from docs/design/logos/hlabs-app-icon.svg into public/icons:
// the app icon at 192 and 512 px, and a 512 px maskable one (the tile without its rounding or margin, so the mark sits
// inside the safe zone whatever shape the system cuts); and iOS's 180 px apple-touch-icon (US-PHONE-23), full bleed
// like the maskable one, since iOS rounds the corners itself and shows transparency as black. Run again when the
// logo changes:
//   node apps/web/scripts/pwa-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const svg = readFileSync(
  fileURLToPath(new URL('../../../docs/design/logos/hlabs-app-icon.svg', import.meta.url)),
  'utf8',
);
const out = (name) => fileURLToPath(new URL(`../public/icons/${name}`, import.meta.url));

// The tile, full bleed: cropped to it and square-cornered.
const maskable = svg
  .replace('viewBox="0 0 1024 1024"', 'viewBox="100 100 824 824"')
  .replaceAll('rx="185"', 'rx="0"')
  .replace(/filter="url\(#sh\)"/, '')
  // Its light rim follows the rounded corners, which a maskable icon doesn't have.
  .replace(/<rect[^>]*stroke="url\(#rim\)"[^>]*\/>/, '');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, size, source] of [
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['maskable-512.png', 512, maskable],
  ['apple-touch-icon-180.png', 180, maskable],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg style="display:block;width:${size}px;height:${size}px" `)}</body></html>`,
  );
  await page.screenshot({ path: out(name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  process.stdout.write(`public/icons/${name}\n`);
}
await browser.close();
