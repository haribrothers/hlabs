// Trash for people (US-FILE-16…18): moving items to the Trash (this computer only: on a network drive they're deleted
// for good instead, after a confirmation), deleting for good, and restoring to where they were (the folder is made
// again if it's gone; a name that's taken gets " (2)"). Each person sees and restores only their own Trash.
import { hlabsCodeOf, hlabsError, type HlabsCode } from '@hlabs/api';
import { auditLog, trashItems, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { joinVirtual, realInside, type Caller } from './places';
import type { FilesService } from './service';
import type { Trash } from './trash';
import { freeName } from './uploads';

const exists = (p: string) =>
  lstat(p).then(
    () => true,
    () => false,
  );

export interface RestoreFailure {
  id: string;
  name: string;
  hlabsCode: HlabsCode;
  /** The drive that isn't connected, when that's why. */
  location: string | null;
}

export class FilesTrash {
  constructor(private readonly deps: { db: HlabsDb; files: FilesService; trash: Trash }) {}

  /** Items to this person's Trash (US-FILE-16); answers their Trash ids for Undo. */
  async trash(caller: Caller, paths: string[]): Promise<{ trashItemIds: string[] }> {
    const files = this.deps.files;
    const items = [];
    for (const path of paths) {
      const place = await files.resolve(caller, path);
      if (place.base === null || place.rest.length === 0) throw hlabsError('FILES_INVALID_PATH');
      if (place.readOnly) throw hlabsError('FILES_READ_ONLY');
      // Trash only covers this computer: a drive's items are deleted for good, after asking (files.delete).
      if (place.area === 'drive' || !place.locationId) throw hlabsError('FILES_NO_TRASH');
      items.push({ place, real: await realInside(place.base, place.host!) });
    }
    const ids: string[] = [];
    for (const { place, real } of items) {
      const { id } = await this.deps.trash.move({
        userId: caller.id,
        locationId: place.locationId!,
        real,
        virtual: place.virtual,
      });
      ids.push(id);
    }
    return { trashItemIds: ids };
  }

  /** Deletes for good (US-FILE-16: a network drive's items), audited. */
  async remove(caller: Caller, paths: string[]) {
    const files = this.deps.files;
    const reals = [];
    for (const path of paths) {
      const place = await files.resolve(caller, path);
      if (place.base === null || place.rest.length === 0) throw hlabsError('FILES_INVALID_PATH');
      if (place.readOnly) throw hlabsError('FILES_READ_ONLY');
      reals.push({ virtual: place.virtual, real: await realInside(place.base, place.host!) });
    }
    for (const { real } of reals) await rm(real, { recursive: true, force: true });
    this.deps.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: caller.id,
        action: 'files.delete',
        target: reals.length === 1 ? reals[0]!.virtual : null,
        detailJson: { count: reals.length },
      })
      .run();
    return { ok: true as const };
  }

  /**
   * Back where they were (US-FILE-16 Undo, US-FILE-17), newest first; `ids` absent means all of this person's.
   * Answers what came back where, and what couldn't and why.
   */
  async restore(caller: Caller, ids?: string[]) {
    const rows = this.deps.db
      .select()
      .from(trashItems)
      .where(
        ids
          ? and(eq(trashItems.ownerUserId, caller.id), inArray(trashItems.id, ids))
          : eq(trashItems.ownerUserId, caller.id),
      )
      .orderBy(desc(trashItems.deletedAt))
      .all();
    const restored: Array<{ id: string; path: string }> = [];
    const failed: RestoreFailure[] = [];
    for (const row of rows) {
      try {
        restored.push({ id: row.id, path: await this.restoreOne(caller, row) });
      } catch (err) {
        const detail = (err as { cause?: { detail?: { location?: string } } }).cause?.detail;
        failed.push({
          id: row.id,
          name: posix.basename(row.originalPath),
          hlabsCode: hlabsCodeOf(err),
          location: detail?.location ?? null,
        });
      }
    }
    return { restored, failed };
  }

  private async restoreOne(caller: Caller, row: typeof trashItems.$inferSelect): Promise<string> {
    const parentVirtual = posix.dirname(row.originalPath);
    const name = posix.basename(row.originalPath);
    // A drive that isn't connected says so (NAS_UNREACHABLE, with its name).
    const place = await this.deps.files.resolve(caller, parentVirtual);
    if (place.base === null || place.readOnly) throw hlabsError('FILES_READ_ONLY');
    if (!(await exists(row.trashPath))) {
      this.deps.db.delete(trashItems).where(eq(trashItems.id, row.id)).run();
      throw hlabsError('NOT_FOUND', 'It is no longer in the Trash');
    }
    // Its folder is made again if it's gone.
    await mkdir(place.host!, { recursive: true });
    const parent = await realInside(place.base, place.host!);
    const free = (await exists(join(parent, name))) ? await freeName(parent, name) : name;
    await rename(row.trashPath, join(parent, free));
    this.deps.db.delete(trashItems).where(eq(trashItems.id, row.id)).run();
    return joinVirtual(parentVirtual, free);
  }
}
