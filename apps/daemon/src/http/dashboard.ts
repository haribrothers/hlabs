// The dashboard's build, served by the daemon (02 §1): Caddy sends dashboard pages here, and the tray opens setup at
// http://127.0.0.1:7474/setup?token=… before Caddy is trusted (US-INST-02, D-013). Files are served as they are;
// any other path without a file extension is the single-page app's index.html, which the router then reads.
// Only when the build is there: `pnpm dev` serves the dashboard with Vite.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Paths the daemon answers itself; never the app's index.html. */
const RESERVED = /^\/(trpc|auth|api|healthz)(\/|$)/;

/** A file inside `root`, or null for anything that would leave it. */
export function fileIn(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const full = resolve(root, `.${decoded}`);
  return full === root || full.startsWith(root + sep) ? full : null;
}

export function registerDashboard(app: FastifyInstance, webDir: string): boolean {
  const root = resolve(webDir);
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) return false;

  app.get('/*', (req, reply) => {
    const path = req.url.split('?')[0] ?? '/';
    if (RESERVED.test(path)) return reply.code(404).send({ error: 'Not found' });
    reply.header('x-content-type-options', 'nosniff').header('referrer-policy', 'same-origin');
    const file = fileIn(root, path);
    if (file && file !== root && existsSync(file) && statSync(file).isFile()) {
      // Vite's hashed assets never change; everything else is checked again.
      const immutable = path.startsWith('/assets/');
      return reply
        .type(TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream')
        .header('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
        .send(readFileSync(file));
    }
    // A missing file (an old asset, a typo) is a 404; a route is the app.
    if (extname(path) !== '') return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
    return reply.type(TYPES['.html']!).header('cache-control', 'no-cache').send(readFileSync(indexPath));
  });
  return true;
}
