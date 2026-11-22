// Serves dist-e2e for the site's tests, like Cloudflare serves the site: /x/ → x/index.html, unknown paths →
// 404.html, and the headers from the built _headers (its Content-Security-Policy included, so every test runs under
// it). (Astro's own `astro preview` runs one preview per project, which a developer's may already be.)
//   node e2e/serve.ts <port> [<folder>, dist-e2e unless given]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 4521);
const root = resolve(import.meta.dirname, '..', process.argv[3] ?? 'dist-e2e');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
  '.pf_meta': 'application/octet-stream',
};

/** _headers as Cloudflare reads it: a path (exact, or ending in *), then its indented "Name: value" lines. */
const rules: Array<{ path: string; headers: Array<[string, string]> }> = [];
if (existsSync(join(root, '_headers'))) {
  for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push({ path: line.trim(), headers: [] });
    else {
      const [name, ...value] = line.trim().split(':');
      rules.at(-1)?.headers.push([name!.trim().toLowerCase(), value.join(':').trim()]);
    }
  }
}
const matches = (pattern: string, path: string) =>
  pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : pattern === path;

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  // Cloudflare reads _headers; it isn't a page.
  const found = path !== '/_headers' && existsSync(file) && statSync(file).isFile();
  const served = found ? file : join(root, '404.html');
  const type = TYPES[extname(served)] ?? 'application/octet-stream';
  const headers: Record<string, string> = { 'content-type': type };
  for (const rule of rules.filter((r) => matches(r.path, path))) {
    for (const [name, value] of rule.headers) headers[name] = value;
  }
  res.writeHead(found ? 200 : 404, headers);
  res.end(readFileSync(served));
}).listen(port, '127.0.0.1');
