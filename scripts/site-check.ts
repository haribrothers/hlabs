// `pnpm site:check` (US-SITE-07, US-SITE-09, US-SITE-10, D-147), after `pnpm site:build`: the help can't fall behind
// the product. It fails when
//   - a P1 or P2 feature of a phase up to 6 (docs/features) has no help page listing it in `features`;
//   - a help slug the product links to (helpUrl) has no page;
//   - an error code (every one the dashboard has words for, which is all of packages/api's) has no error page, or apps/site/src/data/errors.json isn't what the dashboard says;
//   - a help page doesn't say first who it's for ("For everyone…", "For admins…");
//   - a link inside the site, or its #anchor, goes nowhere;
//   - release notes have sections other than New, Improved, Fixed and Before you update, in that order;
//   - the app catalogue names the store's groups differently from the dashboard.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { errorCopy } from '../apps/web/src/copy/errors.ts';
import { categoryLabels } from '../apps/web/src/copy/store.ts';

const root = resolve(import.meta.dirname, '..');
const site = join(root, 'apps/site');
const dist = join(site, 'dist');
const docs = join(site, 'src/content/docs');
/** The last phase whose features must have help (the MVP, D-139). */
const HELP_UP_TO_PHASE = 6;
const problems: string[] = [];
const fail = (line: string) => problems.push(line);

if (!existsSync(dist)) {
  process.stderr.write('Build the site first: pnpm site:build\n');
  process.exit(1);
}

const walk = (dir: string, match: (f: string) => boolean): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : walk(path, match);
    return match(path) ? [path] : [];
  });

// 1. Features: every P1/P2 one shipping by phase 6 has a page (the website's own F-SITE features are the site).
const features = readdirSync(join(root, 'docs/features'))
  .filter((f) => f.endsWith('.md'))
  .flatMap((f) => readFileSync(join(root, 'docs/features', f), 'utf8').split('\n'))
  .map((line) => /^\| (F-[A-Z]+-\d+) \| (.+?) \| (P1|P2) \| (\d+) \|/.exec(line))
  .filter((m): m is RegExpExecArray => m !== null && Number(m[4]) <= HELP_UP_TO_PHASE && !m[1]!.startsWith('F-SITE'))
  .map((m) => ({ id: m[1]!, name: m[2]! }));
const pages = walk(join(docs, 'help'), (f) => /\.mdx?$/.test(f));
const covered = new Set(
  pages.flatMap((p) => {
    const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(p, 'utf8'))?.[1] ?? '';
    return (
      /^features: \[(.*)\]$/m
        .exec(front)?.[1]
        ?.split(',')
        .map((s) => s.trim()) ?? []
    );
  }),
);
for (const f of features) if (!covered.has(f.id)) fail(`No help page lists ${f.id} (${f.name})`);

// 2. Help slugs the product links to.
const sources = ['apps/web/src', 'apps/tray/src', 'apps/cli/src'].flatMap((d) =>
  walk(join(root, d), (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)),
);
const slugs = new Set<string>();
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/helpUrl\(\s*'([^']+)'/g)) slugs.add(m[1]!);
  for (const m of text.matchAll(/export const [A-Z_]*HELP[A-Z_]* = '([^']+)'/g)) slugs.add(m[1]!);
}
for (const slug of slugs) {
  if (!existsSync(join(dist, 'help', slug, 'index.html'))) fail(`helpUrl('${slug}') has no page`);
}

// 3. Error pages: one per code, in the dashboard's words.
const exported = JSON.parse(readFileSync(join(site, 'src/data/errors.json'), 'utf8')) as Array<{
  code: string;
  slug: string;
  title: string;
  body: string;
}>;
const codes = errorCopy.codes as Record<string, (d: Record<string, unknown>) => { title: string; body: string }>;
// The dashboard's copy is typed to cover every code in packages/api (`satisfies Record<HlabsCode, …>`).
const HLABS_CODES = Object.keys(codes);
for (const code of HLABS_CODES) {
  const page = exported.find((e) => e.code === code);
  if (!page) {
    fail(`The error ${code} has no page: run pnpm --filter @hlabs/web errors:export`);
    continue;
  }
  const now = codes[code]?.({});
  if (now && (now.title !== page.title || now.body !== page.body)) {
    fail(`The error page for ${code} isn't what the dashboard says: run pnpm --filter @hlabs/web errors:export`);
  }
  if (!existsSync(join(dist, 'help/errors', page.slug, 'index.html'))) fail(`/help/errors/${page.slug}/ wasn't built`);
}

// 4. Who each help page is for, first thing.
for (const p of pages) {
  const body = readFileSync(p, 'utf8')
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^import .*$/gm, '')
    .trim();
  if (!/^For (everyone|admins|people|anyone)/.test(body)) {
    fail(`${relative(root, p)} doesn't start by saying who it's for ("For everyone." or "For admins.")`);
  }
}

// 5. Links and anchors inside the site.
const htmlFiles = walk(dist, (f) => f.endsWith('.html'));
const ids = new Map<string, Set<string>>();
const idsOf = (file: string) => {
  let found = ids.get(file);
  if (!found) {
    found = new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
    ids.set(file, found);
  }
  return found;
};
const target = (path: string) => {
  const clean = decodeURIComponent(path.split('?')[0]!);
  const candidates = [join(dist, clean), join(dist, clean, 'index.html'), join(dist, `${clean}.html`)];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
};
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const dir = relative(dist, dirname(file)).replace(/\\/g, '/');
  const page = dir ? `/${dir}/` : '/';
  for (const m of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
    const href = m[1]!.replace(/&amp;/g, '&');
    if (/^(https?:|mailto:|data:)/.test(href) || href.startsWith('//')) continue;
    const [path, hash] = href.split('#') as [string, string | undefined];
    const resolved = path === '' ? page : path.startsWith('/') ? path : new URL(path, `https://x${page}`).pathname;
    // A same-page anchor (#top) is on this very file, whatever its name (404.html).
    const to = path === '' ? file : target(resolved);
    if (!to) {
      fail(`${page}: the link ${href} goes nowhere`);
      continue;
    }
    if (hash && to.endsWith('.html') && !idsOf(to).has(decodeURIComponent(hash))) {
      fail(`${page}: the link ${href} has no #${hash} there`);
    }
  }
}

// 6. Release notes (D-146, D-147): only these sections, in this order.
const SECTIONS = ['New', 'Improved', 'Fixed', 'Before you update'];
const notesDir = join(site, 'src/content/releases');
for (const f of existsSync(notesDir) ? readdirSync(notesDir).filter((n) => /^\d.*\.md$/.test(n)) : []) {
  const headings = [...readFileSync(join(notesDir, f), 'utf8').matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim());
  const order = headings.map((h) => SECTIONS.indexOf(h));
  if (order.some((i) => i < 0) || order.some((i, n) => n > 0 && i <= order[n - 1]!)) {
    fail(
      `releases/${f}: use the sections ${SECTIONS.join(', ')}, in that order (it has ${headings.join(', ') || 'none'})`,
    );
  }
}

// 7. The catalogue's groups say what the dashboard's App Store says.
const storeLib = readFileSync(join(site, 'src/lib/store.ts'), 'utf8');
for (const [id, label] of Object.entries(categoryLabels)) {
  if (!storeLib.includes(`${id}: '${label.replace(/'/g, "\\'")}'`)) {
    fail(`apps/site/src/lib/store.ts: the "${id}" group should be called "${label}", as in the dashboard`);
  }
}

if (problems.length) {
  process.stderr.write(`${problems.map((p) => `✗ ${p}`).join('\n')}\n${problems.length} problems\n`);
  process.exit(1);
}
process.stdout.write(
  `✓ ${features.length} features have help, ${slugs.size} help links, ${HLABS_CODES.length} error pages, ${pages.length} pages say who they're for, links checked in ${htmlFiles.length} pages\n`,
);
