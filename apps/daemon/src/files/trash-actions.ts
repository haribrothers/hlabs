// Trash for people (US-FILE-16…18): moving items to the Trash (this computer only: on a network drive they're deleted
// for good instead, after a confirmation), deleting for good, and restoring to where they were (the folder is made
// again if it's gone; a name that's taken gets " (2)"). Each person sees and restores only their own Trash.
import { hlabsCodeOf, hlabsError, type HlabsCode } from '@hlabs/api';
import { auditLog, storageLocations, trashItems, users, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { mimeOf } from './mime';
import { joinVirtual, realInside, type Caller } from './places';
import type { FilesService } from './service';
import type { JobRunner } from '../jobs/runner';
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

/** A Trash bigger than this empties as a job (US-FILE-18). */
export const EMPTY_JOB_BYTES = 1e9;

export class FilesTrash {
  /** Tests lower it. */
  emptyJobBytes = EMPTY_JOB_BYTES;

  constructor(private readonly deps: { db: HlabsDb; files: FilesService; trash: Trash; jobs: JobRunner }) {}

  register() {
    this.deps.jobs.register<{ userId: string; ids: string[] }>('empty_trash', {
      run: async ({ payload, report }) => {
        await this.deleteRows(payload.ids, report);
        report(100);
      },
    });
  }

  /**
   * Deletes the caller's Trash for good (US-FILE-18), or with `allUsers` every person's (US-SYS-14, admins only),
   * audited. A big one is a job.
   */
  async empty(caller: Caller, input?: { allUsers?: boolean }) {
    const everyone = input?.allUsers === true;
    if (everyone && caller.role !== 'admin') throw hlabsError('ACCESS_DENIED');
    const rows = everyone
      ? this.deps.db.select().from(trashItems).all()
      : this.deps.db.select().from(trashItems).where(eq(trashItems.ownerUserId, caller.id)).all();
    const bytes = rows.reduce((n, r) => n + r.size, 0);
    this.deps.db
      .insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: caller.id,
        action: 'files.empty_trash',
        target: null,
        detailJson: everyone ? { count: rows.length, bytes, allUsers: true } : { count: rows.length, bytes },
      })
      .run();
    const ids = rows.map((r) => r.id);
    if (bytes > this.emptyJobBytes) {
      return { jobId: this.deps.jobs.start('empty_trash', { payload: { userId: caller.id, ids } }) };
    }
    await this.deleteRows(ids);
    return { ok: true as const };
  }

  /** Everyone's Trash together (US-SYS-14). */
  totals(): { bytes: number; count: number } {
    const rows = this.deps.db.select({ size: trashItems.size }).from(trashItems).all();
    return { bytes: rows.reduce((n, r) => n + r.size, 0), count: rows.length };
  }

  /** Each item's files, then its row; one already missing on disk just loses its row. */
  private async deleteRows(ids: string[], report?: (progress: number) => void) {
    let done = 0;
    for (const id of ids) {
      const row = this.deps.db.select().from(trashItems).where(eq(trashItems.id, id)).get();
      if (row) {
        await rm(row.trashPath, { recursive: true, force: true }).catch(() => {});
        this.deps.db.delete(trashItems).where(eq(trashItems.id, id)).run();
      }
      done += 1;
      report?.((done / ids.length) * 100);
    }
  }

  /** This person's Trash, newest first (US-FILE-17), paged by offset. */
  async list(caller: Caller, input: { cursor?: string; limit?: number }) {
    const limit = input.limit ?? 50;
    const rows = this.deps.db
      .select()
      .from(trashItems)
      .where(eq(trashItems.ownerUserId, caller.id))
      .orderBy(desc(trashItems.deletedAt))
      .all();
    const from = Math.max(0, Number.parseInt(input.cursor ?? '0', 10) || 0);
    const page = rows.slice(from, from + limit);
    const items = [];
    for (const row of page) {
      const name = posix.basename(row.originalPath);
      const folder = await lstat(row.trashPath).then(
        (st) => st.isDirectory(),
        () => false,
      );
      items.push({
        id: row.id,
        name,
        kind: folder ? ('folder' as const) : ('file' as const),
        mime: folder ? null : mimeOf(name),
        size: row.size,
        originalPath: row.originalPath,
        from: this.fromNames(posix.dirname(row.originalPath)),
        deletedAt: row.deletedAt,
      });
    }
    return { items, nextCursor: from + limit < rows.length ? String(from + limit) : null };
  }

  /** "Documents › Bills" as names: below Home its folders, else the place's name first. */
  private fromNames(parent: string): string[] {
    const [area, second, ...rest] = parent.split('/').filter(Boolean);
    if (area === 'home') return second ? [second, ...rest] : ['Home'];
    if (area === 'shared') return ['Shared', ...(second ? [second, ...rest] : [])];
    if (area === 'drives' && second) {
      const loc = this.deps.db.select().from(storageLocations).where(eq(storageLocations.id, second)).get();
      return [loc?.name ?? second, ...rest];
    }
    if (area === 'users' && second) {
      const person = this.deps.db.select().from(users).where(eq(users.username, second)).get();
      return [person?.displayName ?? second, ...rest];
    }
    return [parent];
  }

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
