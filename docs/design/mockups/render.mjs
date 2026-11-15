// Renders the screen mockups in this folder to docs/design/screens/<Name>.webp at 1440×900 (desktop) with the
// design system's reference components (window.Hlabs, ../reference) and the product's tokens and font.
//   node docs/design/mockups/render.mjs [Name…]
// Each <Name>.html holds only the screen: a <script type="text/babel"> isn't used; screens are plain
// React.createElement code in <script> that renders into #root. Needs `cwebp` (brew install webp).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const requireWeb = createRequire(join(root, 'apps/web/package.json'));
const { chromium } = requireWeb('@playwright/test');

const pnpm = join(root, 'node_modules/.pnpm');
const find = (prefix) => readdirSync(pnpm).find((d) => d.startsWith(prefix));
const react = join(pnpm, find('react@18.'), 'node_modules/react/umd/react.production.min.js');
const reactDom = join(pnpm, find('react-dom@18.'), 'node_modules/react-dom/umd/react-dom.production.min.js');
const fonts = join(pnpm, find('@fontsource+plus-jakarta-sans@'), 'node_modules/@fontsource/plus-jakarta-sans/files');

const fontFaces = [400, 500, 600, 700, 800]
  .map(
    (w) =>
      `@font-face{font-family:'Plus Jakarta Sans';font-weight:${w};font-style:normal;src:url('${pathToFileURL(
        join(fonts, `plus-jakarta-sans-latin-${w}-normal.woff2`),
      )}') format('woff2');}`,
  )
  .join('\n');
const tokens = readFileSync(join(root, 'packages/ui/src/styles/tokens.css'), 'utf8');
const bundleCss = readFileSync(join(root, 'docs/design/reference/bundle.css'), 'utf8').replace(/@import[^;]+;/, '');
const shared = readFileSync(join(here, '_shared.js'), 'utf8');

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(here)
      .filter((f) => f.endsWith('.html'))
      .map((f) => f.slice(0, -5));

const out = mkdtempSync(join(tmpdir(), 'hlabs-mockups-'));
// The Chrome on this computer, so rendering doesn't depend on Playwright's browser download.
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const name of names) {
  const body = readFileSync(join(here, `${name}.html`), 'utf8');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>${fontFaces}\n${tokens}\n${bundleCss}
:root{--font-sans:"Plus Jakarta Sans",system-ui,sans-serif;--font-mono:ui-monospace,Menlo,Consolas,monospace;}
html,body{margin:0;height:100%;}
#root{width:1440px;height:900px;position:relative;overflow:hidden;}
</style>
<script src="${pathToFileURL(react)}"></script><script src="${pathToFileURL(reactDom)}"></script>
<script src="${pathToFileURL(join(root, 'docs/design/reference/bundle.js'))}"></script>
<script>window.HLABS_ROOT=${JSON.stringify(root)};${shared}</script>
</head><body class="hl-root"><div id="root"></div>${body}</body></html>`;
  const file = join(out, `${name}.html`);
  (await import('node:fs')).writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const png = join(out, `${name}.png`);
  await page.locator('#root').screenshot({ path: png });
  execFileSync('cwebp', ['-quiet', '-q', '88', png, '-o', join(root, 'docs/design/screens', `${name}.webp`)]);
  console.log(`docs/design/screens/${name}.webp`);
}
await browser.close();
