// Inlines the fallback page's script and stylesheet into dist-fallback/index.html (US-STATE-04), so the page needs
// nothing else: Caddy serves it for any path while the daemon is down.
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '..', 'dist-fallback');

// index.html: the fallback page; pages.html: the daemon's pages for app hostnames (US-AUTH-17).
for (const page of ['index.html', 'pages.html']) {
  const htmlPath = join(dir, page);
  let html = await readFile(htmlPath, 'utf8');

  const script = /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/;
  const style = /<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/;
  const js = html.match(script);
  const css = html.match(style);
  if (!js || !css) throw new Error(`fallback build: expected one script and one stylesheet in ${page}`);

  const code = (await readFile(join(dir, js[1]), 'utf8')).replaceAll('</script', '<\\/script');
  html = html.replace(style, () => '').replace(script, () => '');
  html = html.replace('</head>', () => `<style>${'\n'}${'CSS'}</style>\n</head>`);
  html = html.replace('CSS', await readFile(join(dir, css[1]), 'utf8'));
  html = html.replace('</body>', () => `<script type="module">${code}</script>\n</body>`);
  await writeFile(htmlPath, html);
  process.stdout.write(`${page}: ${(html.length / 1024).toFixed(0)} KB\n`);
}
await rm(join(dir, 'assets'), { recursive: true, force: true });
