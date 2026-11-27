// Filesystem helpers for store folders (daemon, store CI, website). Not for the browser.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMap, isSeq, parse, parseDocument, type Node } from 'yaml';
import { validateCompose, type ComposeFile, type ComposeIssue } from './compose';
import { AppManifest } from './manifest';
import { attributedApps } from './port';
import { StoreCuration, StoreIndex } from './store-index';
export { generateLibraryKey, keyFingerprint, signIndex, verifyIndex, type LibraryKey } from './signing';
export { Registry, RegistryError, parseImageRef, pinned, type ImageManifest, type ImageRef } from './registry';

export const MANIFEST_FILE = 'hlabs-app.yml';
export const COMPOSE_FILE = 'docker-compose.yml';
export const CURATION_FILE = 'curation.yml';
export const NOTICE_FILE = 'NOTICE';
export const ATTRIBUTION_FILE = 'ATTRIBUTION.md';

/** Values the porting helper left for a person to decide (US-STORE-25): any string starting "TODO". */
export function findTodos(value: unknown, path: Array<string | number> = []): Array<{ path: string; text: string }> {
  if (typeof value === 'string') {
    return /^TODO\b/.test(value) ? [{ path: path.join('.') || '(root)', text: value.replace(/^TODO:?\s*/, '') }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => findTodos(v, [...path, i]));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => findTodos(v, [...path, k]));
  return [];
}

export interface AppIssue {
  file: string;
  path: string;
  code: string;
  message: string;
  /** The line in `file` the problem is on (1-based), when it can be found (`hlabs library check`, US-STORE-27). */
  line?: number;
}

/** The 1-based line of a dotted path (`services.wiki.network_mode`) in YAML text, or of its nearest parent there. */
export function lineOf(text: string, path: string): number | undefined {
  if (!path || path.startsWith('(')) return undefined;
  let node: unknown;
  try {
    node = parseDocument(text).contents;
  } catch {
    return undefined;
  }
  // Where the deepest part of the path found starts: a mapping's key, or a list's item.
  let at: number | undefined;
  for (const key of path.split('.')) {
    if (isMap(node)) {
      const pair = node.items.find((p) => String((p.key as { value?: unknown } | null)?.value) === key);
      if (!pair) break;
      at = (pair.key as Node | null)?.range?.[0] ?? at;
      node = pair.value;
    } else if (isSeq(node)) {
      const item = node.items[Number(key)] as Node | undefined;
      if (!item) break;
      at = item.range?.[0] ?? at;
      node = item;
    } else break;
  }
  return at === undefined ? undefined : text.slice(0, at).split('\n').length;
}

/** Adds lines to issues from the files' text. */
function withLines(issues: AppIssue[], texts: Record<string, string | undefined>): AppIssue[] {
  return issues.map((i) => {
    const text = texts[i.file];
    const line = text === undefined ? undefined : lineOf(text, i.path);
    return line === undefined ? i : { ...i, line };
  });
}

export interface LoadedApp {
  dir: string;
  manifest: AppManifest | null;
  compose: ComposeFile | null;
  issues: AppIssue[];
}

function readYaml(file: string, issues: AppIssue[], name: string): unknown {
  if (!existsSync(file)) {
    issues.push({ file: name, path: '(file)', code: 'FILE_MISSING', message: `${name} is missing` });
    return undefined;
  }
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch (error) {
    issues.push({ file: name, path: '(file)', code: 'YAML_INVALID', message: (error as Error).message });
    return undefined;
  }
}

/** Reads and validates one app folder (manifest, compose rules, logo, screenshots). */
export function loadAppDir(dir: string, options: { requireDigest: boolean }): LoadedApp {
  const issues: AppIssue[] = [];
  const rawManifest = readYaml(join(dir, MANIFEST_FILE), issues, MANIFEST_FILE);
  const rawCompose = readYaml(join(dir, COMPOSE_FILE), issues, COMPOSE_FILE);

  const todos = findTodos(rawManifest);
  for (const t of todos) issues.push({ file: MANIFEST_FILE, path: t.path, code: 'TODO_LEFT', message: t.text });
  for (const t of findTodos(rawCompose)) {
    issues.push({ file: COMPOSE_FILE, path: t.path, code: 'TODO_LEFT', message: t.text });
  }

  let manifest: AppManifest | null = null;
  if (rawManifest !== undefined) {
    const parsed = AppManifest.safeParse(rawManifest);
    if (parsed.success) manifest = parsed.data;
    else {
      // A TODO is already reported; the schema's complaint about the same value adds nothing.
      const underTodo = (path: string) => todos.some((t) => path === t.path || path.startsWith(`${t.path}.`));
      for (const i of parsed.error.issues.filter((i) => !underTodo(i.path.join('.')))) {
        issues.push({
          file: MANIFEST_FILE,
          path: i.path.join('.') || '(root)',
          code: 'MANIFEST_INVALID',
          message: i.message,
        });
      }
    }
  }

  const folderName = dir.split(/[\\/]/).filter(Boolean).at(-1);
  if (manifest && folderName !== manifest.id) {
    issues.push({
      file: MANIFEST_FILE,
      path: 'id',
      code: 'ID_MISMATCH',
      message: `The folder is "${folderName}" but id is "${manifest.id}"`,
    });
  }

  const logo = manifest?.icon?.logo;
  if (logo && !/^https:\/\//.test(logo) && !existsSync(join(dir, logo))) {
    issues.push({ file: MANIFEST_FILE, path: 'icon.logo', code: 'LOGO_MISSING', message: `${logo} is missing` });
  }
  const shotsDir = join(dir, 'screenshots');
  if (existsSync(shotsDir) && readdirSync(shotsDir).filter((f) => !f.startsWith('.')).length > 5) {
    issues.push({
      file: 'screenshots',
      path: '(dir)',
      code: 'TOO_MANY_SCREENSHOTS',
      message: 'Use at most 5 screenshots',
    });
  }

  let compose: ComposeFile | null = null;
  if (manifest && rawCompose !== undefined) {
    const composeIssues: ComposeIssue[] = validateCompose(rawCompose, manifest, options);
    for (const i of composeIssues) issues.push({ file: COMPOSE_FILE, ...i });
    if (composeIssues.length === 0) compose = rawCompose as ComposeFile;
  }

  const text = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : undefined);
  return {
    dir,
    manifest,
    compose,
    issues: withLines(issues, { [MANIFEST_FILE]: text(MANIFEST_FILE), [COMPOSE_FILE]: text(COMPOSE_FILE) }),
  };
}

export function listAppDirs(storeDir: string): string[] {
  const appsDir = join(storeDir, 'apps');
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => join(appsDir, e.name))
    .sort();
}

/** Validates every app in a store folder. Built-in apps must pin images by digest. */
export function lintStore(storeDir: string, options = { requireDigest: true }): LoadedApp[] {
  return listAppDirs(storeDir).map((dir) => loadAppDir(dir, options));
}

/**
 * Apps drafted from another store's definition keep a NOTICE and a row in store/ATTRIBUTION.md (06, D-148):
 * each one without the other is a problem.
 */
export function attributionIssues(storeDir: string): AppIssue[] {
  const file = join(storeDir, ATTRIBUTION_FILE);
  const listed = new Set(existsSync(file) ? attributedApps(readFileSync(file, 'utf8')) : []);
  const issues: AppIssue[] = [];
  const dirs = listAppDirs(storeDir);
  const ids = new Set(dirs.map((d) => d.split(/[\\/]/).at(-1)!));
  for (const dir of dirs) {
    const id = dir.split(/[\\/]/).at(-1)!;
    if (existsSync(join(dir, NOTICE_FILE)) && !listed.has(id)) {
      issues.push({
        file: ATTRIBUTION_FILE,
        path: id,
        code: 'ATTRIBUTION_MISSING',
        message: `apps/${id} has a NOTICE but isn't in ${ATTRIBUTION_FILE}`,
      });
    }
  }
  for (const id of listed) {
    if (!ids.has(id) || !existsSync(join(storeDir, 'apps', id, NOTICE_FILE))) {
      issues.push({
        file: ATTRIBUTION_FILE,
        path: id,
        code: 'NOTICE_MISSING',
        message: `${ATTRIBUTION_FILE} lists ${id}, which has no apps/${id}/${NOTICE_FILE}`,
      });
    }
  }
  return issues;
}

/** The store's curation (featured apps, rows, rank), or an empty one. Throws when the file is invalid. */
export function loadCuration(storeDir: string): StoreCuration {
  const file = join(storeDir, CURATION_FILE);
  return StoreCuration.parse(existsSync(file) ? (parse(readFileSync(file, 'utf8')) ?? {}) : {});
}

/** Curation entries naming apps that aren't in the store. */
export function curationIssues(curation: StoreCuration, appIds: ReadonlySet<string>): AppIssue[] {
  const issues: AppIssue[] = [];
  const check = (ids: string[], path: string) =>
    ids.forEach((id, i) => {
      if (!appIds.has(id)) {
        issues.push({
          file: CURATION_FILE,
          path: `${path}[${i}]`,
          code: 'UNKNOWN_APP',
          message: `No app "${id}" in the store`,
        });
      }
    });
  check(curation.featured, 'featured');
  curation.collections.forEach((c, i) => check(c.appIds, `collections[${i}].appIds`));
  check(curation.rank, 'rank');
  check(curation.hold, 'hold');
  return issues;
}

export function buildStoreIndex(
  storeDir: string,
  source: { id: string; name: string },
  options: { requireDigest?: boolean; skipBroken?: boolean } = {},
): StoreIndex {
  const all = lintStore(storeDir, { requireDigest: options.requireDigest ?? true });
  const broken = all.filter((a) => a.issues.length > 0);
  // A library indexes the apps that pass and says which don't (US-STORE-27); the built-in store must be clean.
  if (broken.length && !options.skipBroken) throw new Error(`Fix store:lint issues first (${broken.length} app(s))`);
  const apps = all.filter((a) => a.issues.length === 0);
  const curation = loadCuration(storeDir);
  if (curationIssues(curation, new Set(apps.map((a) => a.manifest!.id))).length) {
    throw new Error('Fix store:lint issues in curation.yml first');
  }
  const rank = new Map(curation.rank.map((id, i) => [id, i]));
  return StoreIndex.parse({
    schema: 1,
    source,
    ...(curation.featured.length ? { featured: curation.featured } : {}),
    ...(curation.collections.length ? { collections: curation.collections } : {}),
    apps: apps.map(({ dir, manifest }) => {
      const id = manifest!.id;
      const hash = createHash('sha256');
      hash.update(readFileSync(join(dir, MANIFEST_FILE)));
      hash.update(readFileSync(join(dir, COMPOSE_FILE)));
      const logo = manifest!.icon?.logo;
      return {
        id,
        version: manifest!.version,
        revision: manifest!.revision,
        manifestUrl: `apps/${id}/${MANIFEST_FILE}`,
        composeUrl: `apps/${id}/${COMPOSE_FILE}`,
        logoUrl: logo ? (/^https:\/\//.test(logo) ? logo : `apps/${id}/${logo}`) : null,
        digest: `sha256:${hash.digest('hex')}`,
        ...(rank.has(id) ? { rank: rank.get(id) } : {}),
      };
    }),
  });
}
