// What the App Store shows (US-STORE-01…03): the catalogue as cards and rows, the featured apps and rows from the
// built-in store's curation, categories and search. An app in two sources appears once, from the built-in source.
// On an arm64 computer, apps without an arm64 image come after compatible ones and are never featured.
import { hlabsError, type StoreApp } from '@hlabs/api';
import { AppManifest } from '@hlabs/app-manifest';
import { apps, appSources, catalogApps, getSetting, type HlabsDb } from '@hlabs/db';
import { categoryGroupOf, STORE_CATEGORY_GROUPS, type StoreCategoryGroup } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { isRequired } from '../apps/env';
import { defaultFolder } from '../apps/folders';
import { takenHostnames } from '../apps/hostnames';
import { hasRiskyPermissions } from '@hlabs/app-manifest';
import { BUILTIN_SOURCE_ID, type CatalogService } from './catalog';

const PRODUCTS: Array<[RegExp, string]> = [
  [/(^|\/)(postgres|postgis|pgvecto-rs)(:|@|$)/, 'PostgreSQL'],
  [/(^|\/)mariadb(:|@|$)/, 'MariaDB'],
  [/(^|\/)mysql(:|@|$)/, 'MySQL'],
  [/(^|\/)mongo(:|@|$)/, 'MongoDB'],
  [/(^|\/)redis(:|@|$)/, 'Redis'],
  [/(^|\/)valkey(:|@|$)/, 'Valkey'],
  [/(^|\/)memcached(:|@|$)/, 'Memcached'],
];

/** A well-known image's product name, for "Includes" (US-STORE-09). */
export function serviceProduct(image: string | undefined): string | null {
  const repo = (image ?? '').split('@')[0]!.toLowerCase();
  return PRODUCTS.find(([re]) => re.test(repo))?.[1] ?? null;
}

const DATABASE_IMAGES = /(^|\/)(postgres|postgis|pgvecto-rs|mariadb|mysql|mongo)(:|@|$)/;
const CACHE_IMAGES = /(^|\/)(redis|valkey|memcached)(:|@|$)/;

/** "Runs as" roles (US-STORE-06): the web service is the server; well-known images are the database or cache. */
export function serviceRole(name: string, image: string | undefined, webService: string) {
  if (name === webService) return 'server' as const;
  const repo = (image ?? '').split('@')[0]!.toLowerCase();
  if (DATABASE_IMAGES.test(repo)) return 'database' as const;
  if (CACHE_IMAGES.test(repo)) return 'cache' as const;
  return null;
}

export interface StoreHost {
  os: 'macos' | 'linux';
  arm64: boolean;
}

export function currentHost(platform: NodeJS.Platform = process.platform, arch: string = process.arch): StoreHost {
  return { os: platform === 'darwin' ? 'macos' : 'linux', arm64: arch === 'arm64' };
}

/** A catalogue entry with its parsed manifest. */
export interface StoreEntry {
  app: StoreApp;
  manifest: AppManifest;
  /** When the app first appeared in its source (the "New" sort, US-STORE-04). */
  firstSeenAt: number;
}

export type StoreSort = 'popular' | 'new' | 'name';

export interface ListAppsInput {
  category?: StoreCategoryGroup;
  collection?: string;
  query?: string;
  sort?: StoreSort;
  installedOnly?: boolean;
  arm64Only?: boolean;
  cursor?: string;
  limit?: number;
}

/** A page's size unless asked otherwise (US-STORE-04). */
export const PAGE_SIZE = 50;

const byName = (a: StoreEntry, b: StoreEntry) => a.app.name.localeCompare(b.app.name, 'en', { sensitivity: 'base' });

/** Lowercase without accents, for matching (US-STORE-05). */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** A catalogue app's asset (logo, screenshot) as the dashboard loads it. */
export function storeAssetUrl(sourceId: string, appId: string, file: string): string {
  return `/api/store/apps/${sourceId}/${appId}/assets/${file.replace(/^\.?\//, '')}`;
}

/** What this computer has for a new app (US-STORE-07); null when it can't be measured. */
export interface StoreResources {
  engineMemoryBytes(): number | null;
  appDataFreeBytes(): Promise<number | null>;
}

const unmeasured: StoreResources = { engineMemoryBytes: () => null, appDataFreeBytes: async () => null };

const MB = 1024 * 1024;

export class StoreService {
  constructor(
    private readonly db: HlabsDb,
    private readonly catalog: CatalogService,
    readonly host: StoreHost = currentHost(),
    private readonly resources: StoreResources = unmeasured,
  ) {}

  /** The engine's memory less what installed apps recommend (D-080): a rough "free for a new app". */
  private memoryFree(entries: StoreEntry[]): number | null {
    const total = this.resources.engineMemoryBytes();
    if (total === null) return null;
    const installed = new Set(
      this.db
        .select({ id: apps.id })
        .from(apps)
        .all()
        .map((a) => a.id),
    );
    const promised = entries
      .filter((e) => installed.has(e.app.id))
      .reduce((sum, e) => sum + (e.manifest.requirements.memory ?? 0) * MB, 0);
    return Math.max(0, total - promised);
  }

  /**
   * OnbApps' tiles (US-ONB-19): these apps in this order, with the memory each recommends and whether that's more
   * than the engine has free (D-080).
   */
  starterApps(ids: readonly string[]) {
    const entries = this.entries();
    const byId = new Map(entries.map((e) => [e.app.id, e]));
    const free = this.memoryFree(entries);
    return {
      apps: ids.flatMap((id) => {
        const e = byId.get(id);
        if (!e) return [];
        const memoryBytes = e.manifest.requirements.memory ? e.manifest.requirements.memory * MB : null;
        return [
          { app: e.app, memoryBytes, needsMoreMemory: memoryBytes !== null && free !== null && memoryBytes > free },
        ];
      }),
    };
  }

  /** Members browse the store only while "Members can install apps" is on (07 §7.4, US-STORE-01). */
  assertCanBrowse(user: { role: 'admin' | 'member' }): void {
    if (user.role !== 'admin' && !getSetting(this.db, 'people').membersCanInstall) throw hlabsError('ACCESS_DENIED');
  }

  /** Every catalogue app once (built-in source first), A–Z. */
  entries(): StoreEntry[] {
    const installed = new Set(
      this.db
        .select({ id: apps.id })
        .from(apps)
        .all()
        .map((a) => a.id),
    );
    const byId = new Map<string, StoreEntry>();
    for (const row of this.db.select().from(catalogApps).all()) {
      const existing = byId.get(row.appId);
      if (existing && existing.app.sourceId === BUILTIN_SOURCE_ID) continue;
      const parsed = AppManifest.safeParse(row.manifestJson);
      if (!parsed.success) continue;
      const m = parsed.data;
      const logo = m.icon?.logo;
      byId.set(row.appId, {
        manifest: m,
        firstSeenAt: row.firstSeenAt,
        app: {
          id: m.id,
          sourceId: row.sourceId,
          name: m.name,
          tagline: m.tagline,
          category: m.category,
          group: categoryGroupOf(m.category),
          icon: {
            logoUrl: logo ? (/^https:\/\//.test(logo) ? logo : storeAssetUrl(row.sourceId, m.id, logo)) : null,
            gradient: m.icon?.gradient ?? null,
            fallback: m.icon?.fallback ?? null,
          },
          tags: m.tags,
          arm64: m.platforms.includes('linux/arm64'),
          installed: installed.has(m.id),
        },
      });
    }
    return [...byId.values()].sort(byName);
  }

  /** Runs on this computer (an arm64 host needs an arm64 image). */
  compatible(app: StoreApp): boolean {
    return !this.host.arm64 || app.arm64;
  }

  /** Compatible apps first, keeping the given order otherwise. */
  private compatibleFirst(list: StoreApp[]): StoreApp[] {
    return [...list.filter((a) => this.compatible(a)), ...list.filter((a) => !this.compatible(a))];
  }

  getHome() {
    const entries = this.entries();
    const byId = new Map(entries.map((e) => [e.app.id, e.app]));
    const pick = (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const { featured, collections } = this.catalog.curation;
    const rows = collections.length
      ? collections.map((c) => ({ id: c.id, title: c.title, apps: this.compatibleFirst(pick(c.appIds)) }))
      : // No curated rows: one row of every app, A–Z (the dashboard titles it "All apps").
        [{ id: 'all', title: '', apps: this.compatibleFirst(entries.map((e) => e.app)) }];
    return {
      host: this.host,
      featured: pick(featured).filter((a) => this.compatible(a)),
      collections: rows.filter((r) => r.apps.length > 0),
      totalApps: entries.length,
    };
  }

  /**
   * A list of apps (US-STORE-01…05): a collection, a category or search results, sorted, filtered and a page at a time.
   * Without `sort`, a collection keeps its curated order, search its relevance and everything else A–Z. Apps that run
   * on this computer come first on arm64. `counts` are before `installedOnly` (the chips' numbers, US-STORE-05).
   */
  listApps(input: ListAppsInput) {
    let list = this.entries();
    let title: string | null = null;
    if (input.collection) {
      const collection = this.catalog.curation.collections.find((c) => c.id === input.collection);
      if (collection) {
        title = collection.title;
        const order = new Map(collection.appIds.map((id, i) => [id, i]));
        list = list.filter((e) => order.has(e.app.id)).sort((a, b) => order.get(a.app.id)! - order.get(b.app.id)!);
      } else if (input.collection !== 'all') {
        throw hlabsError('NOT_FOUND');
      }
    }
    if (input.category) list = list.filter((e) => e.app.group === input.category);
    const query = fold(input.query?.trim().slice(0, 100).trim() ?? '');
    if (query.length > 1) list = this.search(list, query);
    if (input.sort) list = this.sorted(list, input.sort);
    if (input.arm64Only) list = list.filter((e) => e.app.arm64);
    const counts = { all: list.length, installed: list.filter((e) => e.app.installed).length };
    if (input.installedOnly) list = list.filter((e) => e.app.installed);

    const items = this.compatibleFirst(list.map((e) => e.app));
    const start = Math.max(0, Number.parseInt(input.cursor ?? '0', 10) || 0);
    const end = start + (input.limit ?? PAGE_SIZE);
    return {
      host: this.host,
      title,
      items: items.slice(start, end),
      counts,
      nextCursor: end < items.length ? String(end) : null,
    };
  }

  /** Popular: the built-in index's curated rank, then A–Z (hlabs collects no usage data); New: newest first. */
  private sorted(list: StoreEntry[], sort: StoreSort): StoreEntry[] {
    if (sort === 'name') return [...list].sort(byName);
    if (sort === 'new') return [...list].sort((a, b) => b.firstSeenAt - a.firstSeenAt || byName(a, b));
    const rank = new Map(this.catalog.curation.rank.map((id, i) => [id, i]));
    const at = (e: StoreEntry) => rank.get(e.app.id) ?? Number.MAX_SAFE_INTEGER;
    return [...list].sort((a, b) => at(a) - at(b) || byName(a, b));
  }

  /** Name, id, tagline, tags and description; name and id matches first (US-STORE-05). */
  private search(list: StoreEntry[], query: string): StoreEntry[] {
    const scored = list.flatMap((e) => {
      const { manifest: m } = e;
      if (fold(m.name).includes(query) || m.id.includes(query)) return [{ e, score: 0 }];
      if (fold(m.tagline).includes(query) || m.tags.some((t) => fold(t).includes(query))) return [{ e, score: 1 }];
      if (fold(m.description).includes(query)) return [{ e, score: 2 }];
      return [];
    });
    return scored.sort((a, b) => a.score - b.score).map((s) => s.e);
  }

  /** An app's details page (US-STORE-06, US-STORE-07) and install sheet (US-STORE-08…10), for this person. */
  async getApp(
    appId: string,
    viewer: { username: string; role: 'admin' | 'member' } = { username: '', role: 'admin' },
  ) {
    const username = viewer.username;
    const entries = this.entries();
    const entry = entries.find((e) => e.app.id === appId);
    if (!entry) throw hlabsError('NOT_FOUND');
    const { app, manifest: m } = entry;
    const source = this.db.select().from(appSources).where(eq(appSources.id, app.sourceId)).get();
    const compose = this.catalog.get(appId, app.sourceId)?.compose;
    return {
      host: this.host,
      app,
      source: {
        id: app.sourceId,
        name: app.sourceId === BUILTIN_SOURCE_ID ? 'hlabs official' : (source?.name ?? app.sourceId),
        official: app.sourceId === BUILTIN_SOURCE_ID,
        // The built-in store ships signed with hlabs; another source is signed when its key was pinned (US-STORE-28).
        signed: app.sourceId === BUILTIN_SOURCE_ID || !!source?.publicKey,
        kind: (source?.kind ?? 'builtin') as 'builtin' | 'git' | 'index' | 'local',
      },
      version: m.version,
      description: m.description,
      readme: this.catalog.readme(app.sourceId, appId),
      releaseNotes: m.releaseNotes ?? null,
      screenshots: this.catalog.screenshots(app.sourceId, appId).map((f) => storeAssetUrl(app.sourceId, appId, f)),
      services: Object.entries(compose?.services ?? {}).map(([name, svc]) => ({
        name,
        role: serviceRole(name, svc.image, m.web.service),
        product: serviceProduct(svc.image),
      })),
      address: `${appId}.${getSetting(this.db, 'hostname')}.local`,
      folders: m.folders.map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description ?? null,
        mode: f.mode,
        required: f.required,
        default: defaultFolder(this.db, f, username),
      })),
      requirements: {
        memoryBytes: m.requirements.memory ? m.requirements.memory * MB : null,
        diskBytes: m.requirements.disk ? m.requirements.disk * MB : null,
        memoryFreeBytes: m.requirements.memory ? this.memoryFree(entries) : null,
        diskFreeBytes: m.requirements.disk ? await this.resources.appDataFreeBytes().catch(() => null) : null,
      },
      access: {
        network: m.permissions.network,
        ports: m.ports.map((p) => ({ label: p.label, host: p.host, protocol: p.protocol })),
        gpu: m.permissions.gpu,
        dockerSocket: m.permissions.dockerSocket,
      },
      install: {
        webAuth: m.web.auth,
        ownLogin: m.ownLogin,
        takenHostnames: takenHostnames(this.db),
        env: m.env
          .filter((p) => !p.hidden && !p.generate)
          .map((p) => ({
            key: p.key,
            label: p.label ?? p.key,
            description: p.description ?? null,
            type: p.type,
            options: p.options ?? null,
            default: p.default === undefined ? null : String(p.default),
            required: isRequired(p),
          })),
        risky: hasRiskyPermissions(m),
        allowed:
          viewer.role === 'admin' ||
          (getSetting(this.db, 'people').membersCanInstall &&
            app.sourceId === BUILTIN_SOURCE_ID &&
            !hasRiskyPermissions(m)),
      },
      dependsOn: m.dependsOn.map((id) => {
        const dep = entries.find((e) => e.app.id === id);
        return { appId: id, name: dep?.app.name ?? id, installed: dep?.app.installed ?? false };
      }),
    };
  }

  /** Groups with at least one app, in their fixed order (US-STORE-02). */
  listCategories() {
    const counts = new Map<StoreCategoryGroup, number>();
    for (const { app } of this.entries()) counts.set(app.group, (counts.get(app.group) ?? 0) + 1);
    return {
      categories: STORE_CATEGORY_GROUPS.flatMap((g) =>
        counts.has(g.id) ? [{ id: g.id, count: counts.get(g.id)! }] : [],
      ),
    };
  }
}
