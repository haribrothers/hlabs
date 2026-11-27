// Admins' own app libraries (D-149, 06 §Your own library, US-STORE-27…29): start one, add an app, check it with the
// store's own validator (digests optional), build index.json, and copy a store app into it. Node only; the `hlabs
// library` commands and the daemon's "Copy to my library" use these.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { APP_ID_PATTERN } from '@hlabs/shared';
import { parseDocument } from 'yaml';
import { buildStoreIndex, COMPOSE_FILE, listAppDirs, loadAppDir, MANIFEST_FILE, type LoadedApp } from './node';
import type { StoreIndex } from './store-index';

export const INDEX_FILE = 'index.json';
export const SIGNATURE_FILE = 'index.json.sig';
export const LIBRARY_WORKFLOW = '.github/workflows/hlabs-library.yml';
/** Where `hlabs library sign` finds the public key it signs for (beside index.json). */
export const PUBLIC_KEY_FILE = 'hlabs-library.pub';

/** A library's apps are checked as the store's are, except that images needn't be pinned by digest. */
const LIBRARY_RULES = { requireDigest: false } as const;

export class LibraryError extends Error {}

export interface LibraryProblem {
  appId: string;
  /** `apps/<id>/<file>`, as people see it in the folder. */
  file: string;
  line?: number;
  message: string;
}

/** "apps/wiki/docker-compose.yml:12 Host networking isn't allowed." */
export function problemLine(p: LibraryProblem): string {
  return `${p.file}${p.line ? `:${p.line}` : ''} ${p.message}`;
}

const README = (name: string) => `# ${name}

An app library for [hlabs](https://hlabs.dev): apps hlabs installs and updates from the App Store like its own.

- \`apps/<id>/hlabs-app.yml\` describes an app, \`apps/<id>/docker-compose.yml\` runs it.
- \`hlabs library add <id>\` adds an app to fill in; \`hlabs library check\` checks every app.
- \`hlabs library index\` writes \`index.json\`; \`hlabs library sign\` signs it so hlabs can tell it hasn't changed.

Add it in hlabs: App Store › App sources › Add a source, then the folder (or this repository's address).
`;

const EXAMPLE_MANIFEST = (id: string, name: string) => `schema: 1
id: ${id}
name: ${name}
version: '1.0.0'
revision: 0
tagline: A web page that says who's asking
description: |
  An example app: a tiny web server that answers with the details of each request. Replace it with your own.
category: developer
developer: { name: Traefik Labs, url: https://github.com/traefik/whoami }
source: https://github.com/traefik/whoami
license: Apache-2.0
icon:
  gradient: ['#60a5fa', '#1d4ed8']
  fallback: globe
platforms: [linux/amd64, linux/arm64]
web: { service: web, port: 80 }
permissions: { network: none }
`;

const EXAMPLE_COMPOSE = `services:
  web:
    image: traefik/whoami:v1.10
`;

const NEW_MANIFEST = (id: string) => `schema: 1
id: ${id}
name: TODO the app's name
version: 'TODO the version you run'
revision: 0
tagline: TODO what it does, in a few words
description: |
  TODO what it does and who it's for.
category: other
developer: { name: TODO who makes it }
icon:
  gradient: ['#a78bfa', '#6d28d9']
  fallback: box
platforms: [linux/amd64, linux/arm64]
web: { service: web, port: 8080 }
permissions: { network: internet }
`;

const NEW_COMPOSE = `services:
  web:
    image: TODO the image and tag, e.g. nginx:1.27
    volumes:
      - \${HLABS_APP_DATA}/data:/data
`;

/** The GitHub workflow a library repository runs on every push: check, then index (US-STORE-27). */
export const WORKFLOW = `# Checks this hlabs app library and rebuilds index.json on every push (hlabs library check, hlabs library index).
name: hlabs library
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: write
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Get the hlabs command
        run: |
          base=https://github.com/haribrothers/hlabs/releases/latest/download
          curl -fsSL "$base/SHA256SUMS" -o SHA256SUMS
          name=$(awk '$2 ~ /-linux-x64\\.tar\\.gz$/ { print $2; exit }' SHA256SUMS)
          curl -fsSL "$base/$name" -o "$name"
          grep " $name\\$" SHA256SUMS | sha256sum -c -
          mkdir -p "$RUNNER_TEMP/hlabs" && tar -xzf "$name" -C "$RUNNER_TEMP/hlabs"
          rm -f SHA256SUMS "$name"
      - name: Check
        run: "$RUNNER_TEMP/hlabs/node" "$RUNNER_TEMP/hlabs/cli.mjs" library check .
      - name: Index
        if: github.event_name == 'push'
        run: |
          "$RUNNER_TEMP/hlabs/node" "$RUNNER_TEMP/hlabs/cli.mjs" library index .
          if ! git diff --quiet -- ${INDEX_FILE}; then
            git config user.name "hlabs library"
            git config user.email "hlabs-library@users.noreply.github.com"
            git add ${INDEX_FILE}
            git commit -m "Update index.json"
            git push
          fi
`;

function assertId(id: string) {
  if (!APP_ID_PATTERN.test(id)) {
    throw new LibraryError(`"${id}" can't be an app id: use lowercase letters, numbers and dashes`);
  }
}

/** `hlabs library init <dir>`: a README, `apps/` with an example app, and the repository workflow. */
export function initLibrary(dir: string, name = 'My apps'): string[] {
  if (existsSync(dir) && readdirSync(dir).filter((f) => !f.startsWith('.')).length) {
    throw new LibraryError(`${dir} isn't empty: choose a new folder for the library`);
  }
  const files: Array<[string, string]> = [
    ['README.md', README(name)],
    [`apps/example-app/${MANIFEST_FILE}`, EXAMPLE_MANIFEST('example-app', 'Example app')],
    [`apps/example-app/${COMPOSE_FILE}`, EXAMPLE_COMPOSE],
    [LIBRARY_WORKFLOW, WORKFLOW],
  ];
  for (const [file, text] of files) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return files.map(([f]) => f);
}

/** `hlabs library add <id>`: `apps/<id>/` with a manifest and compose file to fill in (their TODOs say what). */
export function addLibraryApp(dir: string, id: string): string {
  assertId(id);
  if (!existsSync(join(dir, 'apps'))) throw new LibraryError(`${dir} isn't a library: run hlabs library init first`);
  const appDir = join(dir, 'apps', id);
  if (existsSync(appDir)) throw new LibraryError(`apps/${id} is already there`);
  mkdirSync(appDir, { recursive: true });
  writeFileSync(join(appDir, MANIFEST_FILE), NEW_MANIFEST(id));
  writeFileSync(join(appDir, COMPOSE_FILE), NEW_COMPOSE);
  return `apps/${id}`;
}

/** Every app in the library, checked, and its problems with file and line. */
export function checkLibrary(dir: string): { apps: LoadedApp[]; problems: LibraryProblem[] } {
  const apps = listAppDirs(dir).map((d) => loadAppDir(d, LIBRARY_RULES));
  const problems = apps.flatMap((a) => {
    const appId = basename(a.dir);
    return a.issues.map((i) => ({
      appId,
      file: i.file.startsWith('(') ? `apps/${appId}` : `apps/${appId}/${i.file}`,
      ...(i.line ? { line: i.line } : {}),
      message: i.message.endsWith('.') ? i.message : `${i.message}.`,
    }));
  });
  return { apps, problems };
}

/** `hlabs library index`: index.json for the apps that pass; the others are left out and named. */
export function indexLibrary(
  dir: string,
  source: { id: string; name: string },
): { index: StoreIndex; leftOut: string[] } {
  const { apps } = checkLibrary(dir);
  const leftOut = apps.filter((a) => a.issues.length).map((a) => basename(a.dir));
  const index = buildStoreIndex(dir, source, { ...LIBRARY_RULES, skipBroken: true });
  writeFileSync(join(dir, INDEX_FILE), JSON.stringify(index, null, 2) + '\n');
  return { index, leftOut };
}

/** The files of an app folder a copy takes: manifest, compose file and the logo it names. */
export function appFiles(appDir: string): string[] {
  const manifest = loadAppDir(appDir, LIBRARY_RULES).manifest;
  const logo = manifest?.icon?.logo;
  return [MANIFEST_FILE, COMPOSE_FILE, ...(logo && !/^https:\/\//.test(logo) ? [logo.replace(/^\.\//, '')] : [])];
}

/** The copied manifest: the new id, everything else as it was (comments and order kept). */
export function renamedManifest(text: string, newId: string): string {
  const doc = parseDocument(text);
  doc.set('id', newId);
  return String(doc);
}

/** A README for a copied app, saying where it came from (US-STORE-29). */
export function copyReadme(o: { name: string; fromId: string; fromSource: string; version: string; at: Date }) {
  return `# ${o.name}

Copied from **${o.fromId}** ${o.version} in ${o.fromSource} on ${o.at.toISOString().slice(0, 10)}. It's a separate app
now: change it as you need. Its updates come only from this library.
`;
}

/** "Copy to my library" into a folder library: `apps/<newId>/` with the manifest (new id), compose file and logo. */
export function copyAppToLibrary(o: {
  fromDir: string;
  libraryDir: string;
  newId: string;
  fromSource: string;
  now?: Date;
}): string {
  assertId(o.newId);
  const target = join(o.libraryDir, 'apps', o.newId);
  if (existsSync(target)) throw new LibraryError('exists');
  const loaded = loadAppDir(o.fromDir, LIBRARY_RULES);
  if (!loaded.manifest) throw new LibraryError('The app to copy has no valid manifest');
  mkdirSync(target, { recursive: true });
  for (const file of appFiles(o.fromDir)) {
    const to = join(target, file);
    mkdirSync(join(to, '..'), { recursive: true });
    if (file === MANIFEST_FILE)
      writeFileSync(to, renamedManifest(readFileSync(join(o.fromDir, file), 'utf8'), o.newId));
    else copyFileSync(join(o.fromDir, file), to);
  }
  writeFileSync(
    join(target, 'README.md'),
    copyReadme({
      name: loaded.manifest.name,
      fromId: loaded.manifest.id,
      fromSource: o.fromSource,
      version: loaded.manifest.version,
      at: o.now ?? new Date(),
    }),
  );
  return `apps/${o.newId}`;
}
