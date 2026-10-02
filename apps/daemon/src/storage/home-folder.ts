// The size of a person's Home folder (`users/<username>/` in the storage root), for "My files" (US-HOME-12) and
// Account (US-ACCT-28). Walking a big folder is slow, so sizes are worked out in the background and kept for 10 minutes:
// a caller gets the last size, or null while the first one is still being counted.
import { storageLocations, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const HOME_FOLDER_SIZE_TTL_MS = 10 * 60_000;

interface Entry {
  bytes: number | null;
  at: number;
  counting: Promise<void> | null;
}

const sizes = new Map<string, Entry>();

/** Bytes of regular files under `dir`, not following links; an unreadable part counts as empty. */
export async function folderBytes(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) total += await folderBytes(path);
    else if (e.isFile())
      total += await lstat(path).then(
        (s) => s.size,
        () => 0,
      );
  }
  return total;
}

export function homeFolderPath(db: HlabsDb, username: string): string | null {
  const root = db
    .select({ path: storageLocations.path })
    .from(storageLocations)
    .where(eq(storageLocations.isRoot, true))
    .get();
  return root ? join(root.path, 'users', username) : null;
}

/** The last known size, or null while it's first being counted; starts a recount when it's older than 10 minutes. */
export function homeFolderBytes(db: HlabsDb, username: string, now = Date.now()): number | null {
  const path = homeFolderPath(db, username);
  if (!path) return null;
  const entry = sizes.get(path) ?? { bytes: null, at: 0, counting: null };
  sizes.set(path, entry);
  if (!entry.counting && now - entry.at >= HOME_FOLDER_SIZE_TTL_MS) {
    entry.counting = folderBytes(path).then((bytes) => {
      entry.bytes = bytes;
      entry.at = Date.now();
      entry.counting = null;
    });
  }
  return entry.bytes;
}

/** Waits for a count in progress (tests). */
export async function homeFolderCounted(db: HlabsDb, username: string): Promise<void> {
  const path = homeFolderPath(db, username);
  await (path ? sizes.get(path)?.counting : undefined);
}

/** Forgets every size (tests). */
export const forgetHomeFolderSizes = () => sizes.clear();
