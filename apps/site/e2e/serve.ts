// Serves dist-e2e for the site's tests, like a static host: /x/ → x/index.html, unknown paths → 404.html. (Astro's
// own `astro preview` runs one preview per project, which a developer's may already be.)
//   node e2e/serve.ts <port>
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../dist-e2e');
const port = Number(process.argv[2] ?? 4521);
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

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  const found = existsSync(file) && statSync(file).isFile();
  const served = found ? file : join(root, '404.html');
  // install.sh and its checksum and signature are plain text, as on the real host (public/_headers).
  const type = /install\.sh/.test(served)
    ? 'text/plain; charset=utf-8'
    : (TYPES[extname(served)] ?? 'application/octet-stream');
  res.writeHead(found ? 200 : 404, { 'content-type': type });
  res.end(readFileSync(served));
}).listen(port, '127.0.0.1');
