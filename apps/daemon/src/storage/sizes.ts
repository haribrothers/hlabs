// What hlabs's own folders take (US-SYS-11): Files (`users/`, `shared/` and the Trash on the storage root), the backup cache
// (restic's) and hlabs itself (its data folder and bundled programs, without the folders counted elsewhere). Walking a
// big photo library takes a while, so counts run in the background, one at a time, and are kept for 10 minutes; a
// caller waits briefly for the first and otherwise gets the last count (or null).
import { lstat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const SIZES_CACHE_MS = 10 * 60_000;
const WAIT_MS = 1_500;

export interface FolderSizes {
  filesBytes: number;
  backupCacheBytes: number;
  hlabsBytes: number;
}

export interface StorageSizesDeps {
  dataDir: string;
  binDir: string;
  appDataDir: string;
  resticCacheDir: string;
  /** Where network drives are mounted: never walked. */
  mountsDir: string;
  /** The storage root's folder when it's a disk of this computer (local or external); null for a network drive. */
  storageRoot: () => string | null;
  now?: () => number;
  waitMs?: number;
}

/**
 * Bytes under `dir`: files and links as themselves (never followed), without the folders in `skip`, and without
 * anything mounted inside it (another device: a network drive, a disk image). 0 when it's missing.
 */
export async function treeBytes(dir: string, skip: ReadonlySet<string> = new Set()): Promise<number> {
  let device: number;
  try {
    const st = await lstat(dir);
    if (!st.isDirectory()) return st.size;
    device = st.dev;
  } catch {
    return 0;
  }
  let total = 0;
  const walk = async (folder: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (skip.has(path)) continue;
      try {
        const st = await lstat(path);
        if (st.isDirectory()) {
          if (st.dev === device) await walk(path);
        } else {
          total += st.size;
        }
      } catch {
        // Gone since the listing.
      }
    }
  };
  await walk(dir);
  return total;
}

export class StorageSizes {
  private cache: { at: number; sizes: FolderSizes } | null = null;
  private counting: Promise<FolderSizes> | null = null;

  constructor(private readonly deps: StorageSizesDeps) {}

  /** At most 10 minutes old; null while the first count is still going. */
  async get(): Promise<FolderSizes | null> {
    const now = (this.deps.now ?? Date.now)();
    if (this.cache && now - this.cache.at < SIZES_CACHE_MS) return this.cache.sizes;
    const count = (this.counting ??= this.count().finally(() => (this.counting = null)));
    const late = new Promise<null>((r) => setTimeout(() => r(null), this.deps.waitMs ?? WAIT_MS).unref());
    return (await Promise.race([count, late])) ?? this.cache?.sizes ?? null;
  }

  /** Counts again on the next ask (Trash was emptied, images were removed). */
  forget(): void {
    this.cache = null;
  }

  private async count(): Promise<FolderSizes> {
    const d = this.deps;
    const root = d.storageRoot();
    const skip = new Set([d.appDataDir, d.resticCacheDir, d.mountsDir, ...(root ? [root] : [])].map((p) => resolve(p)));
    const [users, shared, trash, backupCacheBytes, data, bin] = await Promise.all([
      root ? treeBytes(join(root, 'users')) : 0,
      root ? treeBytes(join(root, 'shared')) : 0,
      root ? treeBytes(join(root, '.trash')) : 0,
      treeBytes(d.resticCacheDir),
      treeBytes(resolve(d.dataDir), skip),
      treeBytes(d.binDir),
    ]);
    const sizes = { filesBytes: users + shared + trash, backupCacheBytes, hlabsBytes: data + bin };
    this.cache = { at: (d.now ?? Date.now)(), sizes };
    return sizes;
  }
}
