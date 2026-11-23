// A disk by use (US-HOME-02, US-USE-04): what's in use split into apps, files and the rest (system). Apps are each
// installed app's data folder, when the app data folder is on this disk, and its images, when the engine keeps them on
// this disk; an image several apps share counts once. Files count from phase 5 (0 until then). Counting a large app
// takes a while: an app whose first count hasn't finished counts 0 until it has (AppDiskUsage keeps counts 10 minutes).
// Files (`users/` and `shared/` on the storage root, when the root is on this disk), the backup cache and hlabs's own
// folders (when the data folder is on this disk) come from StorageSizes, also counted in the background (US-SYS-11);
// `systemBytes` is everything else in use, hlabs and the backup cache included.
import type { EngineKind } from '@hlabs/api';
import { apps, storageLocations, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import type { AppDiskUsage } from '../apps/disk';
import type { SystemProbe } from '../platform/system';
import type { Services } from '../services';
import type { FolderSizes } from './sizes';

/** The storage root's folder, or null when there's none yet. */
export function rootFolder(db: HlabsDb): string | null {
  return db.select().from(storageLocations).where(eq(storageLocations.isRoot, true)).get()?.path ?? null;
}

export interface StorageByUseDeps {
  db: HlabsDb;
  system: Pick<SystemProbe, 'diskSpace' | 'diskId' | 'engineStoragePath'>;
  disk: Pick<AppDiskUsage, 'get'>;
  appDataDir: string;
  /** The engine in use; null when there is none (then no images are counted). */
  engineKind: () => EngineKind | null;
  /** Files, the backup cache and hlabs's folders, counted in the background; null while the first count runs. */
  sizes?: () => Promise<FolderSizes | null>;
  dataDir?: string;
  /** The storage root's folder (Files are counted only when it's on this disk). */
  storageRoot?: () => string | null;
}

export interface StorageByUse {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  appsBytes: number;
  filesBytes: number;
  systemBytes: number;
  /** Part of systemBytes: hlabs's data folder and programs. */
  hlabsBytes: number;
  /** Part of systemBytes: restic's cache. */
  backupCacheBytes: number;
}

/** What storageByUse needs, from the daemon's services. */
export function byUseDeps(s: Services): StorageByUseDeps {
  return {
    db: s.db,
    system: s.system,
    disk: s.appDisk,
    appDataDir: s.config.paths.appDataDir,
    engineKind: () => (s.engine.status.state === 'missing' ? null : s.engine.status.candidate.kind),
    sizes: () => s.storageSizes.get(),
    dataDir: s.config.paths.dataDir,
    storageRoot: () => rootFolder(s.db),
  };
}

/** The disk holding `path`, by use. */
export async function storageByUse(deps: StorageByUseDeps, path: string): Promise<StorageByUse> {
  const { system } = deps;
  const kind = deps.engineKind();
  const root = deps.storageRoot?.() ?? null;
  const [space, here, appData, engine, rootDisk, dataDisk, sizes] = await Promise.all([
    system.diskSpace(path),
    system.diskId(path),
    system.diskId(deps.appDataDir),
    kind ? system.diskId(system.engineStoragePath(kind)) : Promise.resolve(null),
    root ? system.diskId(root) : Promise.resolve(null),
    deps.dataDir ? system.diskId(deps.dataDir) : Promise.resolve(null),
    deps.sizes ? deps.sizes().catch(() => null) : Promise.resolve(null),
  ]);
  const usedBytes = Math.max(0, space.totalBytes - space.freeBytes);
  const counts = await Promise.all(
    deps.db
      .select({ id: apps.id })
      .from(apps)
      .all()
      .map((a) => deps.disk.get(a.id).catch(() => null)),
  );
  const sameDisk = (other: string | null) => here !== null && other === here;
  let appsBytes = 0;
  const images = new Map<string, number>();
  for (const count of counts) {
    if (!count) continue;
    if (sameDisk(appData)) appsBytes += count.dataBytes;
    for (const image of count.images) images.set(image.id, image.bytes);
  }
  if (sameDisk(engine)) for (const bytes of images.values()) appsBytes += bytes;
  appsBytes = Math.min(appsBytes, usedBytes);
  const filesBytes = Math.min(sizes && sameDisk(rootDisk) ? sizes.filesBytes : 0, usedBytes - appsBytes);
  const systemBytes = Math.max(0, usedBytes - appsBytes - filesBytes);
  const ours = sizes && sameDisk(dataDisk);
  const backupCacheBytes = Math.min(ours ? sizes.backupCacheBytes : 0, systemBytes);
  const hlabsBytes = Math.min(ours ? sizes.hlabsBytes : 0, systemBytes - backupCacheBytes);
  return {
    totalBytes: space.totalBytes,
    freeBytes: space.freeBytes,
    usedBytes,
    appsBytes,
    filesBytes,
    systemBytes,
    hlabsBytes,
    backupCacheBytes,
  };
}
