// The app catalogue (US-SITE-03, US-SITE-04) comes from store/ when the site builds, through the schema the daemon
// checks manifests with: add or remove an app there and the next build shows it, with no edits here.
import { existsSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { listAppDirs, loadAppDir, loadCuration } from '@hlabs/app-manifest/node';
import type { AppManifest } from '@hlabs/app-manifest';
import { STORE_CATEGORY_GROUPS, categoryGroupOf, type StoreCategoryGroup } from '@hlabs/shared';

/** The store's groups in the dashboard's words (apps/web/src/copy/store.ts; `pnpm site:check` keeps them the same). */
export const GROUP_LABELS: Record<StoreCategoryGroup, string> = {
  media: 'Media',
  files: 'Files & photos',
  network: 'Networking',
  home: 'Home automation',
  developer: 'Developer',
  ai: 'Local AI',
  productivity: 'Productivity',
  security: 'Security',
  finance: 'Finance',
  books: 'Books',
  monitoring: 'Monitoring',
  other: 'Other',
};

export interface StoreFile {
  /** Where it's served on this site. */
  url: string;
  /** Where it is in store/. */
  file: string;
}

export interface Need {
  icon: string;
  title: string;
  detail?: string;
}

export interface StoreApp {
  id: string;
  name: string;
  tagline: string;
  description: string[];
  version: string;
  group: StoreCategoryGroup;
  groupLabel: string;
  developer: { name: string; url: string | null };
  website: string | null;
  source: string | null;
  license: string | null;
  logo: string | null;
  logoFile: StoreFile | null;
  gradient: readonly [string, string] | null;
  fallback: string | null;
  screenshots: StoreFile[];
  badges: string[];
  needs: Need[];
  featured: boolean;
}

export interface StoreGroup {
  id: StoreCategoryGroup;
  label: string;
  apps: StoreApp[];
}

const storeDir = () => resolve(process.env.HLABS_STORE_DIR ?? resolve(process.cwd(), '../../store'));

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};
export const contentTypeOf = (file: string) => CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';

/** "home:Photos" → "Home › Photos" (the places the dashboard's folder picker names). */
function placeName(spec: string): string {
  const [root, ...rest] = spec.split(':');
  const label = root === 'home' ? 'Home' : root === 'shared' ? 'Shared' : 'App data';
  return [label, ...rest.join(':').split('/').filter(Boolean)].join(' › ');
}

function size(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

/** "What it needs" (US-SITE-04), in the words the App Store uses. */
function needsOf(m: AppManifest): Need[] {
  const needs: Need[] = [];
  if (m.requirements.memory) {
    needs.push({ icon: 'memory-stick', title: `About ${size(m.requirements.memory)} of memory` });
  }
  for (const f of m.folders) {
    const where = f.default ? `${placeName(f.default)} unless you pick another folder.` : 'You pick the folder.';
    needs.push({
      icon: 'folder',
      title: `A folder: ${f.label}`,
      detail: [f.description && `${f.description.replace(/\.$/, '')}.`, where, f.mode === 'ro' && 'Read only.']
        .filter(Boolean)
        .join(' '),
    });
  }
  if (m.requirements.disk) needs.push({ icon: 'hard-drive', title: `${size(m.requirements.disk)} of free space` });
  const network = {
    internet: 'Reaches the internet',
    lan: 'Your home network only',
    none: 'No network',
  }[m.permissions.network];
  needs.push({ icon: 'globe', title: network });
  if (m.permissions.gpu) needs.push({ icon: 'cpu', title: 'Graphics card (GPU)', detail: 'Uses it to run faster.' });
  if (m.permissions.dockerSocket) {
    needs.push({ icon: 'shield-alert', title: 'Control of your other apps (Docker)' });
  }
  for (const p of m.ports) {
    needs.push({
      icon: 'plug',
      title: `${p.label} on port ${p.host}`,
      detail: 'Opens a port on this computer to your network.',
    });
  }
  if (m.ownLogin) {
    const article = /^[aeiou]/i.test(m.name) ? 'an' : 'a';
    needs.push({
      icon: 'user-round',
      title: 'Its own sign-in',
      detail: `You make ${article} ${m.name} account the first time you open it.`,
    });
  }
  return needs;
}

function badgesOf(m: AppManifest): string[] {
  const badges: string[] = [];
  if (!m.platforms.includes('linux/arm64')) badges.push('x86 only');
  else if (!m.platforms.includes('linux/amd64')) badges.push('ARM only');
  if (m.tags.includes('apple-silicon')) badges.push('Best on Apple silicon');
  return badges;
}

let cache: StoreApp[] | undefined;

/** Every app in the store, in the store's order: curated rank first, then by name. */
export function storeApps(): StoreApp[] {
  if (cache) return cache;
  const dir = storeDir();
  const curation = loadCuration(dir);
  const rank = new Map(curation.rank.map((id, i) => [id, i]));
  const apps: StoreApp[] = [];
  for (const appDir of listAppDirs(dir)) {
    const { manifest: m, issues } = loadAppDir(appDir, { requireDigest: false });
    if (!m) throw new Error(`store/apps/${appDir.split('/').at(-1)}: ${issues.map((i) => i.message).join('; ')}`);
    const logoPath = m.icon?.logo && !/^https:\/\//.test(m.icon.logo) ? join(appDir, m.icon.logo) : null;
    const logoFile =
      logoPath && existsSync(logoPath)
        ? { url: `/apps/${m.id}/logo${extname(logoPath).toLowerCase()}`, file: logoPath }
        : null;
    const shotsDir = join(appDir, 'screenshots');
    const screenshots = existsSync(shotsDir)
      ? readdirSync(shotsDir)
          .filter((f) => !f.startsWith('.') && CONTENT_TYPES[extname(f).toLowerCase()])
          .sort()
          .map((f, i) => ({
            url: `/apps/${m.id}/screenshot-${i + 1}${extname(f).toLowerCase()}`,
            file: join(shotsDir, f),
          }))
      : [];
    const group = categoryGroupOf(m.category);
    apps.push({
      id: m.id,
      name: m.name,
      tagline: m.tagline,
      description: m.description
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
        .filter(Boolean),
      version: m.version,
      group,
      groupLabel: GROUP_LABELS[group],
      developer: { name: m.developer.name, url: m.developer.url ?? null },
      website: m.developer.url ?? null,
      source: m.source ?? null,
      license: m.license ?? null,
      logo: logoFile?.url ?? (m.icon?.logo && /^https:\/\//.test(m.icon.logo) ? m.icon.logo : null),
      logoFile,
      gradient: m.icon?.gradient ?? null,
      fallback: m.icon?.fallback ?? null,
      screenshots,
      badges: badgesOf(m),
      needs: needsOf(m),
      featured: curation.featured.includes(m.id),
    });
  }
  apps.sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6) || a.name.localeCompare(b.name));
  cache = apps;
  return apps;
}

/** The store's groups that have apps, in the store's order. */
export function storeGroups(): StoreGroup[] {
  const apps = storeApps();
  return STORE_CATEGORY_GROUPS.map((g) => ({
    id: g.id,
    label: GROUP_LABELS[g.id],
    apps: apps.filter((a) => a.group === g.id),
  })).filter((g) => g.apps.length > 0);
}
