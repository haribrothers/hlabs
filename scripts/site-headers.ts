// After the website builds (D-147): the Content-Security-Policy for every page, added to the built _headers. Pages
// may only load the site's own files. Inline scripts run only if the build made them: each one's hash is listed.
// Inline styles are allowed (style attributes are everywhere, AppLogo's included), and WebAssembly for search.
//   node scripts/site-headers.ts        (HLABS_SITE_OUT_DIR, as for the build, picks another output folder)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const site = resolve(import.meta.dirname, '../apps/site');
const dist = resolve(site, process.env.HLABS_SITE_OUT_DIR ?? 'dist');
const headersFile = join(dist, '_headers');

const html = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return html(path);
    return name.endsWith('.html') ? [path] : [];
  });

/** The hash of every inline <script>, as CSP writes it. */
export function inlineScriptHashes(pages: string[]): string[] {
  const hashes = new Set<string>();
  for (const page of pages) {
    for (const m of readFileSync(page, 'utf8').matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      if (!m[1]!.trim()) continue;
      hashes.add(`'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`);
    }
  }
  return [...hashes].sort();
}

const hashes = inlineScriptHashes(html(dist));
const policy = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' ${hashes.join(' ')}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');
const line = `  Content-Security-Policy: ${policy}`;
// Cloudflare reads at most 2,000 characters a line.
if (line.length > 2000) {
  throw new Error(`The CSP is ${line.length} characters, over Cloudflare's 2,000: fewer distinct inline scripts`);
}
const headers = readFileSync(headersFile, 'utf8');
if (!/^\/\*$/m.test(headers)) throw new Error(`${headersFile} has no "/*" rule to add the CSP to`);
writeFileSync(headersFile, headers.replace(/^\/\*$/m, `/*\n${line}`));
process.stdout.write(`_headers: CSP with ${hashes.length} inline script hashes (${line.length} characters)\n`);
