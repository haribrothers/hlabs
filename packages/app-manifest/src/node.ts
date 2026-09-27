// Filesystem helpers for store folders (daemon, store CI, website). Not for the browser.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { validateCompose, type ComposeFile, type ComposeIssue } from './compose';
import { AppManifest } from './manifest';
import { StoreIndex } from './store-index';

export const MANIFEST_FILE = 'hlabs-app.yml';
export const COMPOSE_FILE = 'docker-compose.yml';

export interface AppIssue {
  file: string;
  path: string;
  code: string;
  message: string;
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

  let manifest: AppManifest | null = null;
  if (rawManifest !== undefined) {
    const parsed = AppManifest.safeParse(rawManifest);
    if (parsed.success) manifest = parsed.data;
    else {
      for (const i of parsed.error.issues) {
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

  return { dir, manifest, compose, issues };
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

export function buildStoreIndex(storeDir: string, source: { id: string; name: string }): StoreIndex {
  const apps = lintStore(storeDir);
  const broken = apps.filter((a) => a.issues.length > 0);
  if (broken.length) throw new Error(`Fix store:lint issues first (${broken.length} app(s))`);
  return StoreIndex.parse({
    schema: 1,
    source,
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
      };
    }),
  });
}
