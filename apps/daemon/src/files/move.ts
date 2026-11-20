// Move to (US-FILE-22): items go to another folder. On the same disk and under 1 GB it's a rename, done at once (and
// undone by moving back). Across disks, or bigger, it's a `files_move` job: each item is copied to a hidden name
// beside its destination, checked (bytes and files), put in place, and only then removed from where it was. A name
// already in the destination needs a choice per name: skip, keep both ("Name (2)") or replace (the old one goes to the
// Trash).
import { hlabsError } from '@hlabs/api';
import type { HlabsDb } from '@hlabs/db';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, lstat, mkdir, readdir, readlink, rename, rm, stat, symlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { JobRunner } from '../jobs/runner';
import { folderBytes } from '../storage/home-folder';
import { inside, joinVirtual, realInside, type Caller } from './places';
import type { FilesService } from './service';
import type { Trash } from './trash';
import { freeName } from './uploads';

export type MoveConflict = 'skip' | 'keepBoth' | 'replace';
/** Bigger than this, a move runs as a job even on one disk (US-FILE-22). */
export const MOVE_JOB_BYTES = 1e9;

interface Step {
  fromReal: string;
  fromVirtual: string;
  toReal: string;
  toVirtual: string;
  /** What's at `toReal` goes to the Trash first. */
  replace: boolean;
  bytes: number;
}

export interface MovePayload {
  userId: string;
  destLocationId: string | null;
  steps: Step[];
}

const exists = (p: string) =>
  lstat(p).then(
    () => true,
    () => false,
  );

/** Bytes and files below a path (a file is itself), for checking a copy. */
async function tally(path: string): Promise<{ bytes: number; files: number }> {
  const st = await lstat(path);
  if (!st.isDirectory()) return { bytes: st.isFile() ? st.size : 0, files: 1 };
  let bytes = 0;
  let files = 0;
  for (const name of await readdir(path)) {
    const t = await tally(join(path, name));
    bytes += t.bytes;
    files += t.files;
  }
  return { bytes, files };
}

/** Copies a file or folder, calling `onBytes` as bytes land. Links are copied as links. */
async function copyTree(from: string, to: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<void> {
  const st = await lstat(from);
  if (st.isSymbolicLink()) return symlink(await readlink(from), to);
  if (st.isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const name of await readdir(from)) await copyTree(join(from, name), join(to, name), onBytes, signal);
    return;
  }
  const read = createReadStream(from);
  read.on('data', (chunk) => onBytes(chunk.length));
  await pipeline(read, createWriteStream(to), { signal });
}

/** "Lease agreement copy.pdf", then "Lease agreement copy 2.pdf"; folders "Bills copy" (US-FILE-21). */
export async function copyName(dir: string, name: string, isFolder: boolean): Promise<string> {
  const dot = name.lastIndexOf('.');
  const [base, ext] = isFolder || dot <= 0 ? [name, ''] : [name.slice(0, dot), name.slice(dot)];
  for (let n = 1; ; n++) {
    const candidate = `${base} copy${n === 1 ? '' : ` ${n}`}${ext}`;
    if (!(await exists(join(dir, candidate)))) return candidate;
  }
}

export class FileMover {
  /** Tests make a rename fail as one across disks would (EXDEV), and lower the job threshold. */
  renameFn: (from: string, to: string) => Promise<void> = rename;
  jobBytes = MOVE_JOB_BYTES;

  constructor(private readonly deps: { db: HlabsDb; files: FilesService; trash: Trash; jobs: JobRunner }) {}

  register() {
    this.deps.jobs.register<MovePayload>('files_move', {
      run: async ({ payload, report, signal }) => {
        const total = payload.steps.reduce((n, s) => n + s.bytes, 0) || 1;
        let done = 0;
        for (const step of payload.steps) {
          await this.apply(step, payload, signal, (n) => {
            done += n;
            report(Math.min(99, (done / total) * 100));
          });
        }
        report(100);
      },
    });
  }

  /**
   * Moves `paths` into the folder `to`. Names already there need `conflicts[name]`; otherwise FILES_NAME_EXISTS with
   * `detail.names`. Answers what moved where, or the job doing it.
   */
  async move(caller: Caller, input: { paths: string[]; to: string; conflicts?: Record<string, MoveConflict> }) {
    const files = this.deps.files;
    const dest = await files.resolve(caller, input.to);
    if (dest.base === null || dest.readOnly) throw hlabsError('FILES_READ_ONLY');
    const destReal = await realInside(dest.base, dest.host!);
    if (!(await stat(destReal)).isDirectory()) throw hlabsError('FILES_INVALID_PATH');
    const destDev = (await stat(destReal)).dev;

    const sources = [];
    for (const path of input.paths) {
      const place = await files.resolve(caller, path);
      if (place.base === null || place.rest.length === 0) throw hlabsError('FILES_INVALID_PATH');
      if (place.readOnly) throw hlabsError('FILES_READ_ONLY');
      const real = await realInside(place.base, place.host!);
      // Not into itself or one of its own folders.
      if (inside(real, destReal)) throw hlabsError('FILES_INVALID_PATH', 'A folder cannot go inside itself');
      sources.push({ place, real });
    }

    const taken: string[] = [];
    const steps: Step[] = [];
    let crossDisk = false;
    for (const { place, real } of sources) {
      if (dirname(real) === destReal) continue; // Already there.
      const name = basename(real);
      let target = join(destReal, name);
      let replace = false;
      if (await exists(target)) {
        const choice = input.conflicts?.[name];
        if (!choice) {
          taken.push(name);
          continue;
        }
        if (choice === 'skip') continue;
        if (choice === 'keepBoth') target = join(destReal, await freeName(destReal, name));
        else replace = true;
      }
      const st = await lstat(real);
      if (st.dev !== destDev) crossDisk = true;
      const bytes = st.isDirectory() ? await folderBytes(real) : st.size;
      steps.push({
        fromReal: real,
        fromVirtual: place.virtual,
        toReal: target,
        toVirtual: joinVirtual(dest.virtual, basename(target)),
        replace,
        bytes,
      });
    }
    if (taken.length) throw hlabsError('FILES_NAME_EXISTS', taken.join(', '), { names: taken });

    const payload: MovePayload = { userId: caller.id, destLocationId: dest.locationId, steps };
    const bytes = steps.reduce((n, s) => n + s.bytes, 0);
    if (crossDisk || bytes > this.jobBytes) {
      return { jobId: this.deps.jobs.start<MovePayload>('files_move', { payload, target: dest.virtual }) };
    }
    const signal = new AbortController().signal;
    for (const step of steps) await this.apply(step, payload, signal, () => {});
    return { done: true as const, moved: steps.map((s) => ({ from: s.fromVirtual, to: s.toVirtual })) };
  }

  /** Copies items into `to`; a name already there gets " copy" (Duplicate, US-FILE-21). */
  async copy(caller: Caller, input: { paths: string[]; to: string }) {
    const files = this.deps.files;
    const dest = await files.resolve(caller, input.to);
    if (dest.base === null || dest.readOnly) throw hlabsError('FILES_READ_ONLY');
    const destReal = await realInside(dest.base, dest.host!);
    const copied: Array<{ from: string; to: string }> = [];
    for (const path of input.paths) {
      const place = await files.resolve(caller, path);
      if (place.base === null || place.rest.length === 0) throw hlabsError('FILES_INVALID_PATH');
      const real = await realInside(place.base, place.host!);
      if (inside(real, destReal) && real !== destReal && dirname(real) !== destReal) {
        throw hlabsError('FILES_INVALID_PATH', 'A folder cannot go inside itself');
      }
      const st = await lstat(real);
      const name = basename(real);
      const target = (await exists(join(destReal, name))) ? await copyName(destReal, name, st.isDirectory()) : name;
      await cp(real, join(destReal, target), { recursive: true, errorOnExist: true, force: false }).catch(
        (err: NodeJS.ErrnoException) => {
          if (err.code === 'ENOSPC') throw hlabsError('FILES_NO_SPACE');
          if (err.code === 'EACCES' || err.code === 'EROFS' || err.code === 'EPERM')
            throw hlabsError('FILES_READ_ONLY');
          throw err;
        },
      );
      copied.push({ from: place.virtual, to: joinVirtual(dest.virtual, target) });
    }
    return { copied };
  }

  private async apply(step: Step, payload: MovePayload, signal: AbortSignal, onBytes: (n: number) => void) {
    if (step.replace && (await exists(step.toReal))) {
      if (payload.destLocationId) {
        await this.deps.trash.move({
          userId: payload.userId,
          locationId: payload.destLocationId,
          real: step.toReal,
          virtual: step.toVirtual,
        });
      } else {
        await rm(step.toReal, { recursive: true, force: true });
      }
    }
    const fail = (err: NodeJS.ErrnoException): never => {
      if (err.code === 'EACCES' || err.code === 'EROFS' || err.code === 'EPERM') throw hlabsError('FILES_READ_ONLY');
      if (err.code === 'ENOSPC') throw hlabsError('FILES_NO_SPACE');
      throw err;
    };
    // The same disk: a rename.
    const moved = await this.renameFn(step.fromReal, step.toReal).then(
      () => true,
      (err: NodeJS.ErrnoException) => (err.code === 'EXDEV' ? false : fail(err)),
    );
    if (moved) {
      onBytes(step.bytes);
      return;
    }
    // Another disk: copy beside it under a hidden name, check, put in place, then remove the original.
    const temp = join(dirname(step.toReal), `.${basename(step.toReal)}.hlabs-move`);
    await rm(temp, { recursive: true, force: true });
    try {
      await copyTree(step.fromReal, temp, onBytes, signal).catch(fail);
      const [a, b] = await Promise.all([tally(step.fromReal), tally(temp)]);
      if (a.bytes !== b.bytes || a.files !== b.files) throw hlabsError('INTERNAL', 'The copy did not match');
      await rename(temp, step.toReal).catch(fail);
    } catch (err) {
      await rm(temp, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
    await rm(step.fromReal, { recursive: true, force: true });
  }
}
