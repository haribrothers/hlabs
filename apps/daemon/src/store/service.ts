// What the App Store shows (US-STORE-01…03): the catalogue as cards and rows, the featured apps and rows from the
// built-in store's curation, categories and search. An app in two sources appears once, from the built-in source.
// On an arm64 computer, apps without an arm64 image come after compatible ones and are never featured.
import { hlabsError, type StoreApp } from '@hlabs/api';
import { AppManifest } from '@hlabs/app-manifest';
import { apps, catalogApps, getSetting, type HlabsDb } from '@hlabs/db';
import { categoryGroupOf, STORE_CATEGORY_GROUPS, type StoreCategoryGroup } from '@hlabs/shared';
import { BUILTIN_SOURCE_ID, type CatalogService } from './catalog';

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
}

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

export class StoreService {
  constructor(
    private readonly db: HlabsDb,
    private readonly catalog: CatalogService,
    readonly host: StoreHost = currentHost(),
  ) {}

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
    return [...byId.values()].sort((a, b) => a.app.name.localeCompare(b.app.name, 'en', { sensitivity: 'base' }));
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

  listApps(input: { category?: StoreCategoryGroup; collection?: string; query?: string }) {
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
    const query = fold(input.query?.trim().slice(0, 100) ?? '');
    if (query.length > 1) list = this.search(list, query);
    return { host: this.host, title, items: this.compatibleFirst(list.map((e) => e.app)), nextCursor: null };
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
