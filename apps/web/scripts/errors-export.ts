// The website's error pages (US-SITE-09, D-147) say exactly what the dashboard says: this writes each error code's
// title and what to do, from apps/web/src/copy/errors.ts, to apps/site/src/data/errors.json. Details the dashboard
// fills in (an app's name, a port) take its neutral fallbacks. CI checks the file is current.
//   pnpm --filter @hlabs/web errors:export
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { errorCopy } from '../src/copy/errors.ts';

const out = resolve(import.meta.dirname, '../../site/src/data/errors.json');
const codes = errorCopy.codes as Record<string, (detail: Record<string, unknown>) => { title: string; body: string }>;
const entries = Object.keys(codes)
  .sort()
  .map((code) => {
    const { title, body } = codes[code]!({});
    return { code, slug: code.toLowerCase().replace(/_/g, '-'), title, body };
  });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(entries, null, 2)}\n`);
process.stdout.write(`${entries.length} error codes → ${out}\n`);
