// How much disk an app uses (US-APP-07, US-APP-11): its data folder plus its images. Counting a large photo library
// takes a while, so each count is kept for 10 minutes, runs once at a time per app, and a caller waits only briefly
// for the first one (it carries on in the background and the next ask gets it).
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { EngineService } from '../engine/service';

export const DISK_CACHE_MS = 10 * 60_000;
/** How long apps.get waits for a count that isn't cached yet. */
const WAIT_MS = 1_500;

export interface AppDisk {
  /** The app's data folder (`app-data/<appId>`): what "Delete its data too" removes. */
  dataBytes: number;
  /** Its images' layers. */
  imageBytes: number;
}

export interface AppDiskUsageDeps {
  appDataDir: string;
  engine: Pick<EngineService, 'client'>;
  /** The app's compose project name. */
  project: (appId: string) => string;
  now?: () => number;
  waitMs?: number;
}

/** The bytes of everything under `dir` (links counted as themselves, never followed); 0 when it's missing. */
export async function folderBytes(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    try {
      total += (await lstat(join(entry.parentPath, entry.name))).size;
    } catch {
      // Gone since the listing.
    }
  }
  return total;
}

export class AppDiskUsage {
  private readonly cache = new Map<string, { at: number; disk: AppDisk }>();
  private readonly counting = new Map<string, Promise<AppDisk>>();

  constructor(private readonly deps: AppDiskUsageDeps) {}

  /** The app's disk use, at most 10 minutes old; null while a first count is still going. */
  async get(appId: string): Promise<AppDisk | null> {
    const now = (this.deps.now ?? Date.now)();
    const hit = this.cache.get(appId);
    if (hit && now - hit.at < DISK_CACHE_MS) return hit.disk;
    const count = this.counting.get(appId) ?? this.count(appId);
    const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), this.deps.waitMs ?? WAIT_MS).unref());
    return (await Promise.race([count, late])) ?? hit?.disk ?? null;
  }

  /** Drops what's known about an app (it was uninstalled, or its data changed a lot). */
  forget(appId: string): void {
    this.cache.delete(appId);
  }

  private count(appId: string): Promise<AppDisk> {
    const run = (async () => {
      const [dataBytes, imageBytes] = await Promise.all([
        folderBytes(join(this.deps.appDataDir, appId)),
        this.imageBytes(appId),
      ]);
      const disk = { dataBytes, imageBytes };
      this.cache.set(appId, { at: (this.deps.now ?? Date.now)(), disk });
      return disk;
    })().finally(() => this.counting.delete(appId));
    this.counting.set(appId, run);
    return run;
  }

  private async imageBytes(appId: string): Promise<number> {
    const engine = this.deps.engine.client;
    if (!engine) return 0;
    try {
      const containers = await engine.projectContainers(this.deps.project(appId));
      const sizes = await Promise.all([...new Set(containers.map((c) => c.imageId))].map((i) => engine.imageSize(i)));
      return sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0);
    } catch {
      return 0;
    }
  }
}
