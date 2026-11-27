// `pnpm store:port <id> --from <runtipi:<id> | casaos:<Name> | https URL of a compose file> [--web service:port]
// [--force]`: drafts store/apps/<id>/ for the built-in store (US-STORE-25, D-148). Reads the source at its current
// commit, pins every image by tag and multi-arch digest, fetches the logo when the source has an SVG or PNG, and
// writes a NOTICE and a row in store/ATTRIBUTION.md for a Runtipi or CasaOS source. What it can't decide is left as
// a TODO that `pnpm store:lint` refuses. Then: `pnpm store:lint`, `pnpm store:matrix <id>`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { APP_ID_PATTERN } from '@hlabs/shared';
import { parse, stringify } from 'yaml';
import { ATTRIBUTION_FILE, COMPOSE_FILE, MANIFEST_FILE, NOTICE_FILE } from '../node';
import {
  parseFrom,
  portApp,
  STORES,
  withAttribution,
  type Compose,
  type PortInput,
  type RuntipiConfig,
  type RuntipiDynamic,
} from '../port';
import { Registry, type ImageManifest } from '../registry';

const [storeArg, id, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

/** Output for the person running it (the lint rule keeps console.log out of the code). */
const say = (line: string) => void process.stdout.write(`${line}\n`);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!id || !flag('--from')) {
  fail(
    'Usage: pnpm store:port <id> --from <runtipi:<id> | casaos:<Name> | https://…/docker-compose.yml> [--web service:port] [--force]',
  );
}
if (!APP_ID_PATTERN.test(id)) fail(`"${id}" isn't an app id: 2–39 lowercase letters, numbers and dashes`);
const storeDir = resolve(storeArg!);
const appDir = join(storeDir, 'apps', id);
if (existsSync(appDir) && !rest.includes('--force'))
  fail(`store/apps/${id} already exists; add --force to replace its draft`);

let from: ReturnType<typeof parseFrom>;
try {
  from = parseFrom(flag('--from')!);
} catch (error) {
  fail((error as Error).message);
}
const webFlag = flag('--web');
const web = webFlag
  ? (() => {
      const m = /^([a-zA-Z0-9][a-zA-Z0-9_.-]*):(\d+)$/.exec(webFlag);
      if (!m) fail('--web takes service:port, e.g. --web app:8080');
      return { service: m[1]!, port: Number(m[2]) };
    })()
  : undefined;

const github = {
  'user-agent': 'hlabs-store-port',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};
async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, { headers: { ...(/github/.test(url) ? github : {}), ...headers } });
}
async function text(url: string): Promise<string | null> {
  const res = await get(url);
  if (res.status === 404) return null;
  if (!res.ok) fail(`Couldn't read ${url}: ${res.status}`);
  return res.text();
}

/** The store's current commit, so the NOTICE and the files read point at the same version. */
async function commitOf(repo: string, branch: string): Promise<string> {
  const res = await get(`https://api.github.com/repos/${repo}/commits/${branch}`, {
    accept: 'application/vnd.github.sha',
  });
  if (!res.ok) fail(`Couldn't read ${repo}'s latest commit: ${res.status}`);
  return (await res.text()).trim();
}

/** The project's licence from its GitHub repository, as an SPDX id. */
async function licenseOf(source: string | undefined): Promise<string | null> {
  const m = source && /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/.exec(source);
  if (!m) return null;
  const res = await get(`https://api.github.com/repos/${m[1]}/${m[2]!.replace(/\.git$/, '')}`);
  if (!res.ok) return null;
  const spdx = ((await res.json()) as { license?: { spdx_id?: string } | null }).license?.spdx_id;
  return spdx && spdx !== 'NOASSERTION' ? spdx : null;
}

/** Downloads a logo hlabs accepts (SVG or PNG) into the app folder; returns its file name. */
async function saveLogo(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    const ext = /\.(svg|png)(\?|$)/i.exec(url)?.[1]?.toLowerCase();
    if (!ext) continue;
    const res = await get(url);
    if (!res.ok) continue;
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, `logo.${ext}`), Buffer.from(await res.arrayBuffer()));
    return `logo.${ext}`;
  }
  return null;
}

const input: PortInput = { id, from, web, images: {} };
let images: string[];
let source: string | undefined;
let logoUrls: string[] = [];

if (from.kind === 'runtipi') {
  const store = STORES.runtipi;
  input.commit = await commitOf(store.repo, store.branch);
  const base = `https://raw.githubusercontent.com/${store.repo}/${input.commit}/apps/${from.id}`;
  const config = await text(`${base}/config.json`);
  if (!config) fail(`Runtipi has no app "${from.id}"`);
  const dynamic = await text(`${base}/docker-compose.json`);
  const yml = dynamic ? null : await text(`${base}/docker-compose.yml`);
  input.runtipi = {
    config: JSON.parse(config) as RuntipiConfig,
    ...(dynamic ? { dynamic: JSON.parse(dynamic) as RuntipiDynamic } : {}),
    ...(yml ? { compose: parse(yml) as Compose } : {}),
  };
  images = dynamic
    ? input.runtipi.dynamic!.services.map((s) => s.image)
    : Object.values(input.runtipi.compose!.services).map((s) => String(s.image));
  source = input.runtipi.config.source;
  // Runtipi's logos are JPEG, which hlabs doesn't take: the person adds the project's own.
} else if (from.kind === 'casaos') {
  const store = STORES.casaos;
  input.commit = await commitOf(store.repo, store.branch);
  const base = `https://raw.githubusercontent.com/${store.repo}/${input.commit}/Apps/${from.id}`;
  const yml = await text(`${base}/docker-compose.yml`);
  if (!yml) fail(`CasaOS has no app "${from.id}" (names are as in its Apps folder, e.g. Jellyfin)`);
  input.casaos = parse(yml) as Compose;
  images = Object.values(input.casaos.services).map((s) => String(s.image));
  const x = (input.casaos['x-casaos'] ?? {}) as { repo?: string; icon?: string };
  source = x.repo;
  logoUrls = [`${base}/icon.svg`, `${base}/icon.png`, ...(x.icon ? [x.icon] : [])];
} else {
  const yml = await text(from.url);
  if (!yml) fail(`Nothing at ${from.url}`);
  input.compose = parse(yml) as Compose;
  images = Object.values(input.compose.services).map((s) => String(s.image));
  const gh = /github(?:usercontent)?\.com\/([^/]+)\/([^/]+)/.exec(from.url);
  source = gh ? `https://github.com/${gh[1]}/${gh[2]}` : undefined;
}

const registry = new Registry((url, init) => fetch(url, init));
for (const image of new Set(images)) {
  try {
    input.images[image] = await registry.manifest(image);
  } catch (error) {
    input.images[image] = error as Error;
  }
}
input.license = await licenseOf(source);
input.logoFile = await saveLogo(logoUrls);

const draft = portApp(input);
const origin = from.kind === 'compose' ? from.url : `${STORES[from.kind].name} (${flag('--from')})`;
mkdirSync(appDir, { recursive: true });
writeFileSync(
  join(appDir, MANIFEST_FILE),
  `# Drafted by pnpm store:port from ${origin}. Resolve every TODO, then pnpm store:lint and pnpm store:matrix ${id}.\n${stringify(draft.manifest, { lineWidth: 0 })}`,
);
writeFileSync(
  join(appDir, COMPOSE_FILE),
  `# Drafted by pnpm store:port from ${origin}, under hlabs's compose rules (06).\n${stringify(draft.compose, { lineWidth: 0 })}`,
);
if (draft.notice) writeFileSync(join(appDir, NOTICE_FILE), draft.notice);
if (draft.attribution) {
  const file = join(storeDir, ATTRIBUTION_FILE);
  writeFileSync(file, withAttribution(existsSync(file) ? readFileSync(file, 'utf8') : null, draft.attribution));
}

const pins = Object.entries(input.images) as Array<[string, ImageManifest | Error]>;
say(`Drafted store/apps/${id}/ from ${origin}`);
for (const [image, pin] of pins) {
  say(
    `  ${image}: ${pin instanceof Error ? `not pinned (${pin.message})` : `${pin.digest.slice(0, 19)}… ${pin.platforms.join(', ')}`}`,
  );
}
if (draft.todos.length) {
  say(`\n${draft.todos.length} thing(s) to decide (pnpm store:lint fails until they're done):`);
  for (const t of draft.todos) say(`  - ${t}`);
}
say(`\nThen: pnpm store:lint && pnpm store:matrix ${id}`);
