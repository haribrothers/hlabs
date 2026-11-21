// Renders the disk image background (background.html, US-INST-03, D-142) to background.png (660×400) and
// background@2x.png, joins them into background.tiff for Retina (tiffutil, macOS), and writes preview-light.png and
// preview-dark.png with pretend icons and labels to check the layout.
//   node apps/tray/dmg/render.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const { chromium } = createRequire(join(root, 'apps/web/package.json'))('@playwright/test');
const pnpm = join(root, 'node_modules/.pnpm');
const fonts = join(
  pnpm,
  readdirSync(pnpm).find((d) => d.startsWith('@fontsource+plus-jakarta-sans@')),
  'node_modules/@fontsource/plus-jakarta-sans/files',
);
const work = mkdtempSync(join(tmpdir(), 'hlabs-dmg-'));
const appsIcon = join(work, 'apps.png');
execFileSync('sips', [
  '-s',
  'format',
  'png',
  '-z',
  '256',
  '256',
  '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/ApplicationsFolderIcon.icns',
  '--out',
  appsIcon,
]);
const html = readFileSync(join(here, 'background.html'), 'utf8')
  .replace('FONT_700', pathToFileURL(join(fonts, 'plus-jakarta-sans-latin-700-normal.woff2')).href)
  .replace('FONT_500', pathToFileURL(join(fonts, 'plus-jakarta-sans-latin-500-normal.woff2')).href)
  .replace('PREVIEW_APP', pathToFileURL(join(root, 'docs/design/logos/hlabs-app-icon-1024.png')).href)
  .replace('PREVIEW_APPS', pathToFileURL(appsIcon).href);
const page_ = join(work, 'background.html');
writeFileSync(page_, html);

const browser = await chromium.launch();
for (const [scale, name, query] of [
  [1, 'background.png', ''],
  [2, 'background@2x.png', ''],
  [2, 'preview-light.png', '?preview=light'],
  [2, 'preview-dark.png', '?preview=dark'],
]) {
  const page = await browser.newPage({ viewport: { width: 660, height: 400 }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(page_).href + query);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(here, name) });
  await page.close();
}
await browser.close();
execFileSync('tiffutil', [
  '-cathidpicheck',
  join(here, 'background.png'),
  join(here, 'background@2x.png'),
  '-out',
  join(here, 'background.tiff'),
]);
process.stdout.write(`Rendered into ${here}\n`);
