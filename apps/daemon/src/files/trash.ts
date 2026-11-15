// The Trash service (D-027): files and folders that are replaced (an upload's "Replace", US-FILE-10) or deleted move
// to `.trash/<userId>/` at the top of the storage location they're on (the storage root, or a drive), so nothing is
// copied between disks, and get a `trash_items` row. Items are removed for good after 30 days. The Trash screen and
// restoring ship in phase 8.
import { storageLocations, trashItems, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq, lt } from 'drizzle-orm';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { folderBytes } from '../storage/home-folder';

export const TRASH_KEEP_MS = 30 * 24 * 60 * 60_000;

export class Trash {
  constructor(private readonly deps: { db: HlabsDb }) {}

  /** Moves `real` (inside the location `locationId`) to that location's Trash for `userId`. */
  async move(input: { userId: string; locationId: string; real: string; virtual: string }, now = Date.now()) {
    const loc = this.deps.db
      .select({ path: storageLocations.path })
      .from(storageLocations)
      .where(eq(storageLocations.id, input.locationId))
      .get();
    if (!loc) throw new Error(`No storage location ${input.locationId}`);
    const st = await lstat(input.real);
    const size = st.isDirectory() ? await folderBytes(input.real) : st.size;
    const dir = join(loc.path, '.trash', input.userId);
    await mkdir(dir, { recursive: true });
    const id = ulid();
    const trashPath = join(dir, `${id}-${basename(input.real)}`);
    await rename(input.real, trashPath);
    this.deps.db
      .insert(trashItems)
      .values({ id, ownerUserId: input.userId, originalPath: input.virtual, trashPath, deletedAt: now, size })
      .run();
    return { id, trashPath };
  }

  /** Removes items trashed more than 30 days ago. */
  async sweep(now = Date.now()) {
    const old = this.deps.db
      .select()
      .from(trashItems)
      .where(lt(trashItems.deletedAt, now - TRASH_KEEP_MS))
      .all();
    for (const item of old) {
      await rm(item.trashPath, { recursive: true, force: true }).catch(() => {});
      this.deps.db.delete(trashItems).where(eq(trashItems.id, item.id)).run();
    }
    return old.length;
  }
}
