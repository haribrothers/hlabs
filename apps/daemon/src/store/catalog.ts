// The store catalogue: `catalog_apps` is a cache of each source's apps, rebuilt on sync (04 §Apps). The built-in
// source is the `store/` folder that ships with hlabs; it is read from disk at every start, so it always matches
// this version. Other sources (US-STORE-18, D-160) sync into the same table from their folder: a library folder
// itself, or the copy of a remote source in `<dataDir>/sources/<id>/`; their images needn't be pinned by digest.
import { curationIssues, loadAppDir, listAppDirs, loadCuration, type LoadedApp } from '@hlabs/app-manifest/node';
import type { AppManifest, ComposeFile, StoreCuration } from '@hlabs/app-manifest';
import { appSources, catalogApps, type HlabsDb } from '@hlabs/db';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import type { Logger } from '../logger';

export const BUILTIN_SOURCE_ID = 'builtin';

export interface CatalogApp {
  sourceId: string;
  manifest: AppManifest;
  compose: ComposeFile;
  /** The app's folder (logo, screenshots). */
  dir: string;
}

/** Image types an app's logo and screenshots may have. */
export const ASSET_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const EMPTY_CURATION: StoreCuration = { featured: [], collections: [], rank: [], hold: [] };

export class CatalogService {
  /** The built-in store's featured apps, rows and rank, read at each sync. */
  private curationValue: StoreCuration = EMPTY_CURATION;

  constructor(
    private readonly db: HlabsDb,
    private readonly storeDir: string,
    private readonly logger: Logger,
    /** Where remote sources are kept (`<dataDir>/sources`); none in tests that only use the built-in store. */
    private readonly sourcesDir: string | null = null,
  ) {}

  /** A source's folder: the built-in store, a library folder, or a remote source's copy; null when unknown. */
  dirOf(sourceId: string): string | null {
    if (sourceId === BUILTIN_SOURCE_ID) return this.storeDir;
    const row = this.db.select().from(appSources).where(eq(appSources.id, sourceId)).get();
    if (!row) return null;
    if (row.kind === 'local') return row.url;
    return this.sourcesDir ? join(this.sourcesDir, sourceId) : null;
  }

  /** The same rules for every source except the built-in one's pinned digests. */
  private rules(sourceId: string) {
    return { requireDigest: sourceId === BUILTIN_SOURCE_ID };
  }

  /**
   * Replaces a source's catalogue with the apps in its folder that pass, in one transaction (a sync never leaves half
   * a catalogue). Keeps each app's first-seen and version-seen times.
   */
  replaceSource(
    sourceId: string,
    dir: string,
    now: number = Date.now(),
    /** Apps the source's own checks left out (changed since a signed index). */
    leaveOut: ReadonlySet<string> = new Set(),
  ): string[] {
    const valid = listAppDirs(dir)
      .map((d) => loadAppDir(d, this.rules(sourceId)))
      .filter((a): a is LoadedApp & { manifest: AppManifest } => a.issues.length === 0 && a.manifest !== null)
      .filter((a) => !leaveOut.has(a.manifest.id));
    this.db.transaction((tx) => {
      const ids = valid.map((a) => a.manifest.id);
      tx.delete(catalogApps)
        .where(
          ids.length
            ? and(eq(catalogApps.sourceId, sourceId), notInArray(catalogApps.appId, ids))
            : eq(catalogApps.sourceId, sourceId),
        )
        .run();
      for (const { manifest } of valid) this.upsert(tx, sourceId, manifest, now);
    });
    return valid.map((a) => a.manifest.id);
  }

  private upsert(tx: Pick<HlabsDb, 'insert'>, sourceId: string, manifest: AppManifest, now: number) {
    tx.insert(catalogApps)
      .values({
        sourceId,
        appId: manifest.id,
        version: manifest.version,
        manifestJson: manifest,
        updatedAt: now,
        firstSeenAt: now,
        versionSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [catalogApps.sourceId, catalogApps.appId],
        set: {
          version: manifest.version,
          manifestJson: manifest,
          updatedAt: now,
          // Kept while it's the same version and revision; a new one starts its "released" clock.
          versionSeenAt: sql`CASE WHEN ${catalogApps.version} = ${manifest.version}
            AND coalesce(json_extract(${catalogApps.manifestJson}, '$.revision'), 0) = ${manifest.revision}
            THEN ${catalogApps.versionSeenAt} ELSE ${now} END`,
        },
      })
      .run();
  }

  /** Reads `store/apps/*` and replaces the built-in rows. Apps that fail validation are left out and logged. */
  syncBuiltin(now: number = Date.now()): { synced: string[]; skipped: string[] } {
    const loaded = listAppDirs(this.storeDir).map((dir) => loadAppDir(dir, { requireDigest: true }));
    const valid = loaded.filter((a): a is LoadedApp & { manifest: AppManifest } => a.issues.length === 0);
    const skipped = loaded.filter((a) => a.issues.length > 0);
    for (const app of skipped) {
      this.logger.warn({ dir: app.dir, issues: app.issues }, 'built-in app failed validation; left out of the store');
    }

    this.db.transaction((tx) => {
      tx.insert(appSources)
        .values({ id: BUILTIN_SOURCE_ID, name: 'hlabs', url: 'builtin:', kind: 'builtin', enabled: true })
        .onConflictDoNothing()
        .run();
      const ids = valid.map((a) => a.manifest.id);
      tx.delete(catalogApps)
        .where(
          ids.length
            ? and(eq(catalogApps.sourceId, BUILTIN_SOURCE_ID), notInArray(catalogApps.appId, ids))
            : eq(catalogApps.sourceId, BUILTIN_SOURCE_ID),
        )
        .run();
      for (const { manifest } of valid) this.upsert(tx, BUILTIN_SOURCE_ID, manifest, now);
      tx.update(appSources)
        .set({
          lastSyncedAt: now,
          lastError: skipped.length ? `${skipped.length} app(s) failed validation` : null,
        })
        .where(eq(appSources.id, BUILTIN_SOURCE_ID))
        .run();
    });

    this.curationValue = this.readCuration(new Set(valid.map((a) => a.manifest.id)));
    return { synced: valid.map((a) => a.manifest.id), skipped: skipped.map((a) => a.dir) };
  }

  get curation(): StoreCuration {
    return this.curationValue;
  }

  /** An invalid curation is logged and ignored (the store home then shows "All apps"); unknown ids are dropped. */
  private readCuration(ids: ReadonlySet<string>): StoreCuration {
    try {
      const curation = loadCuration(this.storeDir);
      const issues = curationIssues(curation, ids);
      if (issues.length) this.logger.warn({ issues }, 'curation.yml names apps that are not in the store');
      const known = (list: string[]) => list.filter((id) => ids.has(id));
      return {
        featured: known(curation.featured),
        collections: curation.collections
          .map((c) => ({ ...c, appIds: known(c.appIds) }))
          .filter((c) => c.appIds.length > 0),
        rank: known(curation.rank),
        hold: known(curation.hold),
      };
    } catch (err) {
      this.logger.warn({ err }, 'curation.yml is invalid; the store home shows all apps');
      return EMPTY_CURATION;
    }
  }

  /**
   * The file behind an app's logo or screenshot URL, or null. Only the manifest's logo and images in `screenshots/`
   * are served, from inside the app's own folder.
   */
  assetPath(sourceId: string, appId: string, file: string): string | null {
    const root = this.dirOf(sourceId);
    if (!root || !/^[a-z0-9][a-z0-9-]{1,38}$/.test(appId)) return null;
    if (!ASSET_TYPES[extname(file).toLowerCase()] || file.split('/').some((part) => part === '..' || part === '')) {
      return null;
    }
    const row = this.db
      .select({ manifest: catalogApps.manifestJson })
      .from(catalogApps)
      .where(and(eq(catalogApps.sourceId, sourceId), eq(catalogApps.appId, appId)))
      .get();
    if (!row) return null;
    const logo = (row.manifest as { icon?: { logo?: string } }).icon?.logo?.replace(/^\.?\//, '');
    if (file !== logo && !/^screenshots\/[^/]+$/.test(file)) return null;
    const dir = join(root, 'apps', appId);
    const path = join(dir, file);
    if (!existsSync(path)) return null;
    const real = realpathSync(path);
    return real.startsWith(realpathSync(dir) + sep) ? real : null;
  }

  /** Screenshot files (`screenshots/<name>`), sorted by name, at most 5 (06 §layout). */
  screenshots(sourceId: string, appId: string): string[] {
    const root = this.dirOf(sourceId);
    if (!root) return [];
    const dir = join(root, 'apps', appId, 'screenshots');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => !f.startsWith('.') && ASSET_TYPES[extname(f).toLowerCase()])
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .slice(0, 5)
      .map((f) => `screenshots/${f}`);
  }

  /** The app's README.md, if it has one. */
  readme(sourceId: string, appId: string): string | null {
    const root = this.dirOf(sourceId);
    if (!root) return null;
    const file = join(root, 'apps', appId, 'README.md');
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  }

  /**
   * The app store an app's files were drafted from, from its NOTICE ("…from the Runtipi app store…",
   * "Licence: … (GPL-3.0).") (D-148, US-STORE-23); null without one.
   */
  packagedFrom(sourceId: string, appId: string): { store: 'Runtipi' | 'CasaOS'; license: string } | null {
    const root = this.dirOf(sourceId);
    if (!root) return null;
    const file = join(root, 'apps', appId, 'NOTICE');
    if (!existsSync(file)) return null;
    const text = readFileSync(file, 'utf8');
    const store = /\b(Runtipi|CasaOS) app store\b/.exec(text)?.[1] as 'Runtipi' | 'CasaOS' | undefined;
    const license = /^Licence:.*\(([^()]+)\)\.?\s*$/m.exec(text)?.[1];
    return store && license ? { store, license } : null;
  }

  /** Manifest and compose file to install from, validated again (the folder may have changed since sync). */
  get(appId: string, sourceId: string = BUILTIN_SOURCE_ID): CatalogApp | null {
    const root = this.dirOf(sourceId);
    if (!root) return null;
    const row = this.db
      .select({ appId: catalogApps.appId })
      .from(catalogApps)
      .where(and(eq(catalogApps.sourceId, sourceId), eq(catalogApps.appId, appId)))
      .get();
    if (!row) return null;
    const loaded = loadAppDir(join(root, 'apps', appId), this.rules(sourceId));
    if (!loaded.manifest || !loaded.compose || loaded.issues.length) return null;
    return { sourceId, manifest: loaded.manifest, compose: loaded.compose, dir: loaded.dir };
  }
}
