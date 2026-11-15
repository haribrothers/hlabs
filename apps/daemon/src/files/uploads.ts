// Resumable uploads (US-FILE-08…10): a session per person, folder and name; bytes arrive in chunks of up to 8 MB at
// the offset the server has, are written to `.<name>.hlabs-part` in the folder (hidden, so it never shows) and fsynced
// before they count. The last chunk renames it into place, after the name-conflict choice: skip, keep both
// ("<name> (2).<ext>") or replace (the old file goes to the Trash). Sessions with no chunk for 24 h are removed.
import { hlabsError } from '@hlabs/api';
import { uploadSessions, users, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, eq, lt } from 'drizzle-orm';
import { lstat, open, rename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Readable } from 'node:stream';
import type { Caller, Place } from './places';
import { joinVirtual, realInside } from './places';
import { validName, type FilesService } from './service';
import type { Trash } from './trash';

export type OnConflict = 'skip' | 'keepBoth' | 'replace';

/** The client sends 8 MB; a little more is allowed, more than this is refused. */
export const CHUNK_MAX = 16 * 1024 * 1024;
/** An upload must leave this much free on its disk (US-FILE-08). */
export const SPACE_RESERVE = 1_000_000_000;
/** No chunk for this long: the session and its partial file go (US-FILE-09). */
export const IDLE_MS = 24 * 60 * 60_000;

export const partName = (name: string) => `.${name}.hlabs-part`;

/** "Report (2).pdf", "Notes (3)": the first number from 2 not taken in the folder. */
export async function freeName(dir: string, name: string): Promise<string> {
  const ext = extname(name);
  const stem = ext && ext !== name ? name.slice(0, -ext.length) : name;
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext !== name ? ext : ''}`;
    if (
      !(await lstat(join(dir, candidate)).then(
        () => true,
        () => false,
      ))
    )
      return candidate;
  }
}

type Session = typeof uploadSessions.$inferSelect;
export type Finished = { path: string; name: string } | { skipped: true };

export interface UploadsDeps {
  db: HlabsDb;
  files: FilesService;
  trash: Trash;
  /** Free bytes on the disk holding `path`. */
  freeBytes: (path: string) => Promise<number>;
}

export class Uploads {
  /** Sessions a request is writing to right now: a second tab gets UPLOAD_IN_PROGRESS. */
  private readonly busy = new Set<string>();

  constructor(private readonly deps: UploadsDeps) {}

  /** The folder an upload goes to, checked for this person: it must exist and be writable. */
  private async folder(caller: Caller, path: string): Promise<{ place: Place; dir: string }> {
    const place = await this.deps.files.resolve(caller, path);
    if (place.base === null || place.readOnly) throw hlabsError('FILES_READ_ONLY');
    const dir = await realInside(place.base, place.host!);
    if (!(await stat(dir)).isDirectory()) throw hlabsError('FILES_INVALID_PATH');
    return { place, dir };
  }

  /**
   * Starts an upload, or picks up the one already there for the same folder, name and size (US-FILE-09: a reloaded
   * page resumes). A session for the same name with another size is replaced.
   */
  async create(
    caller: Caller,
    input: { path: string; name: string; size: number; onConflict?: OnConflict },
    now = Date.now(),
  ): Promise<{ id: string; offset: number }> {
    if (!validName(input.name) || input.name !== input.name.trim()) throw hlabsError('FILES_INVALID_NAME');
    if (!Number.isSafeInteger(input.size) || input.size < 0) throw hlabsError('VALIDATION_FAILED');
    const { place, dir } = await this.folder(caller, input.path);
    const onConflict = input.onConflict ?? 'keepBoth';
    const { db } = this.deps;
    const existing = db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.userId, caller.id),
          eq(uploadSessions.path, place.virtual),
          eq(uploadSessions.name, input.name),
        ),
      )
      .get();
    const part = join(dir, partName(input.name));
    if (existing && existing.size === input.size) {
      const have = await stat(part).then(
        (s) => s.size,
        () => -1,
      );
      if (have >= existing.received) {
        db.update(uploadSessions).set({ onConflict, updatedAt: now }).where(eq(uploadSessions.id, existing.id)).run();
        return { id: existing.id, offset: existing.received };
      }
    }
    if (existing) {
      if (this.busy.has(existing.id)) throw hlabsError('UPLOAD_IN_PROGRESS');
      db.delete(uploadSessions).where(eq(uploadSessions.id, existing.id)).run();
    }
    const free = await this.deps.freeBytes(dir);
    if (input.size > free - SPACE_RESERVE) throw hlabsError('FILES_NO_SPACE', 'Not enough space', { free });
    await (await open(part, 'w')).close();
    const id = ulid();
    db.insert(uploadSessions)
      .values({
        id,
        userId: caller.id,
        path: place.virtual,
        name: input.name,
        size: input.size,
        received: 0,
        onConflict,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { id, offset: 0 };
  }

  /** This person's session, with its folder resolved again (access is checked every time). */
  private async session(caller: Caller, id: string) {
    const row = this.deps.db
      .select()
      .from(uploadSessions)
      .where(and(eq(uploadSessions.id, id), eq(uploadSessions.userId, caller.id)))
      .get();
    if (!row) throw hlabsError('NOT_FOUND', 'No such upload');
    const { place, dir } = await this.folder(caller, row.path);
    return { row, place, dir, part: join(dir, partName(row.name)) };
  }

  async offset(caller: Caller, id: string) {
    const { row } = await this.session(caller, id);
    return { offset: row.received, size: row.size };
  }

  /**
   * Writes a chunk at `offset`, which must be where the session is (else UPLOAD_OFFSET_MISMATCH with the right one).
   * Bytes past what a dropped connection left are cut first. The last chunk finishes the upload.
   */
  async append(
    caller: Caller,
    id: string,
    offset: number,
    body: Readable,
    now: () => number = Date.now,
  ): Promise<{ offset: number; done: Finished | null }> {
    const { row, place, dir, part } = await this.session(caller, id);
    if (this.busy.has(id)) throw hlabsError('UPLOAD_IN_PROGRESS');
    if (offset !== row.received) {
      throw hlabsError('UPLOAD_OFFSET_MISMATCH', 'Wrong offset', { offset: row.received });
    }
    this.busy.add(id);
    try {
      const fh = await open(part, 'r+').catch(async (err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
        if (row.received > 0) throw hlabsError('UPLOAD_OFFSET_MISMATCH', 'Partial file gone', { offset: 0 });
        return open(part, 'w+');
      });
      let at = row.received;
      try {
        await fh.truncate(at);
        const limit = Math.min(row.size - at, CHUNK_MAX);
        for await (const data of body) {
          const buf = data as Buffer;
          if (at + buf.length - row.received > limit) throw hlabsError('VALIDATION_FAILED', 'Chunk too big');
          await fh.write(buf, 0, buf.length, at);
          at += buf.length;
        }
        await fh.sync();
      } finally {
        await fh.close();
      }
      this.deps.db
        .update(uploadSessions)
        .set({ received: at, updatedAt: now() })
        .where(eq(uploadSessions.id, id))
        .run();
      if (at < row.size) return { offset: at, done: null };
      return { offset: at, done: await this.finish(caller, { ...row, received: at }, place, dir, part) };
    } finally {
      this.busy.delete(id);
    }
  }

  /** All bytes are here: the name-conflict choice, then the partial file takes its name (US-FILE-10). */
  private async finish(caller: Caller, row: Session, place: Place, dir: string, part: string): Promise<Finished> {
    const target = join(dir, row.name);
    const taken = await lstat(target).then(
      () => true,
      () => false,
    );
    let name = row.name;
    if (taken && row.onConflict === 'skip') {
      await rm(part, { force: true });
      this.deps.db.delete(uploadSessions).where(eq(uploadSessions.id, row.id)).run();
      return { skipped: true };
    }
    if (taken && row.onConflict === 'keepBoth') name = await freeName(dir, row.name);
    if (taken && row.onConflict === 'replace') {
      await this.deps.trash.move({
        userId: caller.id,
        locationId: place.locationId!,
        real: target,
        virtual: joinVirtual(place.virtual, row.name),
      });
    }
    await rename(part, join(dir, name));
    this.deps.db.delete(uploadSessions).where(eq(uploadSessions.id, row.id)).run();
    return { path: joinVirtual(place.virtual, name), name };
  }

  /** Cancels an upload: the session and its partial file go; finished files are untouched. */
  async cancel(caller: Caller, id: string) {
    const { part } = await this.session(caller, id);
    if (this.busy.has(id)) throw hlabsError('UPLOAD_IN_PROGRESS');
    await rm(part, { force: true });
    this.deps.db.delete(uploadSessions).where(eq(uploadSessions.id, id)).run();
  }

  /** This person's unfinished uploads ("<n> uploads were interrupted", US-FILE-09). */
  list(caller: Caller) {
    return this.deps.db
      .select({
        id: uploadSessions.id,
        path: uploadSessions.path,
        name: uploadSessions.name,
        size: uploadSessions.size,
        received: uploadSessions.received,
        updatedAt: uploadSessions.updatedAt,
      })
      .from(uploadSessions)
      .where(eq(uploadSessions.userId, caller.id))
      .orderBy(uploadSessions.createdAt)
      .all();
  }

  /** Sessions with no chunk for 24 hours go, with their partial files. */
  async sweep(now = Date.now()) {
    const { db } = this.deps;
    const old = db
      .select()
      .from(uploadSessions)
      .where(lt(uploadSessions.updatedAt, now - IDLE_MS))
      .all();
    for (const row of old) {
      if (this.busy.has(row.id)) continue;
      const user = db.select({ role: users.role }).from(users).where(eq(users.id, row.userId)).get();
      if (user) {
        try {
          const { dir } = await this.folder(this.deps.files.caller(row.userId, user.role), row.path);
          await rm(join(dir, partName(row.name)), { force: true });
        } catch {
          // The folder or drive is gone: nothing left to remove.
        }
      }
      db.delete(uploadSessions).where(eq(uploadSessions.id, row.id)).run();
    }
    return old.length;
  }
}
