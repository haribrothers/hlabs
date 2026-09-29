// The store catalogue: `catalog_apps` is a cache of each source's apps, rebuilt on sync (04 §Apps). The built-in
// source is the `store/` folder that ships with hlabs; it is read from disk at every start, so it always matches
// this version. Git and index sources (phase 7) sync into the same table.
import { loadAppDir, listAppDirs, type LoadedApp } from '@hlabs/app-manifest/node';
import type { AppManifest, ComposeFile } from '@hlabs/app-manifest';
import { appSources, catalogApps, type HlabsDb } from '@hlabs/db';
import { and, eq, notInArray } from 'drizzle-orm';
import { join } from 'node:path';
import type { Logger } from '../logger';

export const BUILTIN_SOURCE_ID = 'builtin';

export interface CatalogApp {
  sourceId: string;
  manifest: AppManifest;
  compose: ComposeFile;
  /** The app's folder (logo, screenshots). */
  dir: string;
}

export class CatalogService {
  constructor(
    private readonly db: HlabsDb,
    private readonly storeDir: string,
    private readonly logger: Logger,
  ) {}

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
      for (const { manifest } of valid) {
        tx.insert(catalogApps)
          .values({
            sourceId: BUILTIN_SOURCE_ID,
            appId: manifest.id,
            version: manifest.version,
            manifestJson: manifest,
            updatedAt: now,
            firstSeenAt: now,
          })
          .onConflictDoUpdate({
            target: [catalogApps.sourceId, catalogApps.appId],
            set: { version: manifest.version, manifestJson: manifest, updatedAt: now },
          })
          .run();
      }
      tx.update(appSources)
        .set({
          lastSyncedAt: now,
          lastError: skipped.length ? `${skipped.length} app(s) failed validation` : null,
        })
        .where(eq(appSources.id, BUILTIN_SOURCE_ID))
        .run();
    });

    return { synced: valid.map((a) => a.manifest.id), skipped: skipped.map((a) => a.dir) };
  }

  /** Manifest and compose file to install from, validated again (the folder may have changed since sync). */
  get(appId: string, sourceId: string = BUILTIN_SOURCE_ID): CatalogApp | null {
    if (sourceId !== BUILTIN_SOURCE_ID) return null;
    const row = this.db
      .select({ appId: catalogApps.appId })
      .from(catalogApps)
      .where(and(eq(catalogApps.sourceId, sourceId), eq(catalogApps.appId, appId)))
      .get();
    if (!row) return null;
    const loaded = loadAppDir(join(this.storeDir, 'apps', appId), { requireDigest: true });
    if (!loaded.manifest || !loaded.compose || loaded.issues.length) return null;
    return { sourceId, manifest: loaded.manifest, compose: loaded.compose, dir: loaded.dir };
  }
}
