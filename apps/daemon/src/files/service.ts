// Files (07-files): listing, details, new folders, recents and search over the virtual paths of places.ts. Every call
// resolves the path for the caller first, so access is enforced here and not only in the dashboard.
import { hlabsError, type FileEntry } from '@hlabs/api';
import { appMounts, apps, fileShares, getUserSetting, setUserSetting, storageLocations, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { appSummary, catalogManifest } from '../apps/list';
import { visibleAppIds } from '../home/layout';
import type { Dirent, Stats } from 'node:fs';
import { lstat, mkdir, readdir, realpath, rename, stat } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { dimensionsOf } from './dimensions';
import { mimeOf, PREVIEW_IMAGES, PREVIEW_VIDEOS } from './mime';
import { PreviewTokens, previewUrl } from './preview-tokens';
import {
  inside,
  isHidden,
  joinVirtual,
  locationOf,
  Places,
  realInside,
  type Caller,
  type Crumb,
  type Place,
} from './places';

export const PAGE_SIZE = 200;
export const RECENT_COUNT = 50;
/** Search and Recents stop walking after this long and return what they found (US-FILE-04). */
export const WALK_BUDGET_MS = 5_000;
/** Made in a Home folder the first time Files opens it (US-FILE-01). */
export const HOME_FOLDERS = ['Photos', 'Documents', 'Downloads'] as const;

export type Sort = 'name' | 'modified' | 'size' | 'kind';

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const extOf = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '');

export type SortDir = 'asc' | 'desc';

/** Each order's natural direction: names A to Z, newest first, biggest first (US-FILE-19). */
export const DEFAULT_DIR: Record<Sort, SortDir> = { name: 'asc', modified: 'desc', size: 'desc', kind: 'asc' };

/** Folders first, then files, whatever the order (US-FILE-19); each group by the chosen order and direction. */
export function sortEntries(items: FileEntry[], sort: Sort = 'name', dir: SortDir = DEFAULT_DIR[sort]): FileEntry[] {
  const up = (a: FileEntry, b: FileEntry) => {
    if (sort === 'modified') return a.modifiedAt - b.modifiedAt;
    if (sort === 'size') return (a.size ?? a.childCount ?? 0) - (b.size ?? b.childCount ?? 0);
    if (sort === 'kind') return byName(extOf(a.name), extOf(b.name));
    return byName(a.name, b.name);
  };
  const sign = dir === 'asc' ? 1 : -1;
  const order = (a: FileEntry, b: FileEntry) => sign * up(a, b) || byName(a.name, b.name);
  return [...items].sort((a, b) => (a.kind === b.kind ? order(a, b) : a.kind === 'folder' ? -1 : 1));
}

/** At most `n` at a time. */
async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

async function visibleCount(dir: string): Promise<number> {
  return readdir(dir).then(
    (names) => names.filter((n) => !isHidden(n)).length,
    () => 0,
  );
}

const entryOf = (name: string, path: string, st: Stats, childCount: number | null): FileEntry =>
  st.isDirectory()
    ? { name, path, kind: 'folder', size: null, childCount, modifiedAt: st.mtimeMs, mime: null, previewUrl: null }
    : {
        name,
        path,
        kind: 'file',
        size: st.size,
        childCount: null,
        modifiedAt: st.mtimeMs,
        mime: mimeOf(name),
        previewUrl: null,
      };

/** Images and videos a browser can show get a thumbnail or first frame in listings (US-FILE-02). */
export const hasThumbnail = (mime: string | null) => !!mime && (PREVIEW_IMAGES.has(mime) || PREVIEW_VIDEOS.has(mime));

export interface FilesDeps {
  db: HlabsDb;
  appDataDir: string;
}

export class FilesService {
  readonly places: Places;
  readonly tokens = new PreviewTokens();

  constructor(private readonly deps: FilesDeps) {
    this.places = new Places(deps);
  }

  caller(userId: string, role: 'admin' | 'member'): Caller {
    return this.places.caller(userId, role);
  }

  /**
   * Resolves a path; the caller's Home folder is made when it's missing, and the first time Files opens it so are
   * Photos, Documents and Downloads (existing folders are never touched).
   */
  async resolve(caller: Caller, virtual: string): Promise<Place> {
    const place = await this.places.resolve(caller, virtual);
    if (place.area === 'home') await this.setUpHome(caller, place.base!);
    return place;
  }

  private async setUpHome(caller: Caller, home: string) {
    await mkdir(home, { recursive: true });
    if (getUserSetting(this.deps.db, 'filesSetUp', caller.id)) return;
    for (const dir of HOME_FOLDERS) {
      await mkdir(join(home, dir)).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'EEXIST') throw err;
      });
    }
    setUserSetting(this.deps.db, 'filesSetUp', caller.id, true);
  }

  /** Signed preview links on the images and videos among `items`. */
  private withPreviews(caller: Caller, items: FileEntry[]): FileEntry[] {
    const now = Date.now();
    return items.map((e) =>
      e.kind === 'file' && hasThumbnail(e.mime)
        ? { ...e, previewUrl: previewUrl(this.tokens.sign(caller.id, e.path, now).token) }
        : e,
    );
  }

  /**
   * Running apps this person can open whose folders hold the file (US-FILE-07): each `app_mounts` folder (its storage
   * location's path and subpath) that the file is in. Apps are listed once, in the order they were installed.
   */
  async openWith(caller: Caller, path: string, isPublished?: (name: string) => boolean) {
    const place = await this.resolve(caller, path);
    if (place.base === null || place.rest.length === 0) throw hlabsError('FILES_INVALID_PATH');
    const real = await realInside(place.base, place.host!);
    const visible = new Set(visibleAppIds(this.deps.db, { id: caller.id, role: caller.role }));
    const rows = this.deps.db
      .select({ app: apps, location: storageLocations.path, subpath: appMounts.subpath })
      .from(appMounts)
      .innerJoin(apps, eq(apps.id, appMounts.appId))
      .innerJoin(storageLocations, eq(storageLocations.id, appMounts.storageLocationId))
      .where(eq(apps.state, 'running'))
      .orderBy(apps.installedAt)
      .all();
    const found = new Map<string, typeof apps.$inferSelect>();
    for (const row of rows) {
      if (found.has(row.app.id) || !visible.has(row.app.id)) continue;
      const folder = await realpath(join(row.location, row.subpath)).catch(() => null);
      if (folder && inside(folder, real)) found.set(row.app.id, row.app);
    }
    return {
      apps: [...found.values()]
        .map((app) => appSummary(this.deps.db, app, isPublished))
        .map(({ webPath: _w, ...a }) => a),
    };
  }

  /** A signed link to a file for this person, for 5 minutes (US-FILE-06); `width` asks for a thumbnail. */
  async preview(caller: Caller, input: { path: string; width?: number }) {
    const place = await this.resolve(caller, input.path);
    if (place.base === null || place.rest.length === 0) throw hlabsError('FILES_INVALID_PATH');
    const real = await realInside(place.base, place.host!);
    if (!(await stat(real)).isFile()) throw hlabsError('FILES_INVALID_PATH');
    const { token, expiresAt } = this.tokens.sign(caller.id, place.virtual);
    return { url: previewUrl(token) + (input.width ? `?w=${input.width}` : ''), expiresAt };
  }

  /** The visible entries of a folder on disk; symlinks leading out of the place are left out. */
  private async entriesOf(place: Place, dirReal: string, virtual: string): Promise<FileEntry[]> {
    const realBase = await realpath(place.base!);
    let dirents: Dirent[];
    try {
      dirents = await readdir(dirReal, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOTDIR') throw hlabsError('FILES_INVALID_PATH');
      throw hlabsError('NOT_FOUND', 'No such folder');
    }
    const found = await mapLimit(
      dirents.filter((d) => !isHidden(d.name)),
      32,
      async (d): Promise<FileEntry | null> => {
        const host = join(dirReal, d.name);
        if (d.isSymbolicLink()) {
          const real = await realpath(host).catch(() => null);
          if (!real || !inside(realBase, real)) return null;
        }
        const st = await stat(host).catch(() => null);
        if (!st || (!st.isDirectory() && !st.isFile())) return null;
        const children = st.isDirectory() ? await visibleCount(host) : null;
        return entryOf(d.name, joinVirtual(virtual, d.name), st, children);
      },
    );
    return found.filter((e): e is FileEntry => e !== null);
  }

  /** The lists of places: every Home folder and Shared (`/users`), every installed app (`/appdata`). */
  private async placeEntries(place: Place): Promise<FileEntry[]> {
    if (place.area === 'users') {
      const root = this.places.rootPath();
      const names = this.places.displayNames();
      const homes = join(root, 'users');
      const dirents = await readdir(homes, { withFileTypes: true }).catch(() => [] as Dirent[]);
      const out: FileEntry[] = [];
      for (const d of dirents) {
        if (isHidden(d.name) || !d.isDirectory()) continue;
        const st = await stat(join(homes, d.name));
        out.push(entryOf(names.get(d.name) ?? d.name, `/users/${d.name}`, st, await visibleCount(join(homes, d.name))));
      }
      const shared = join(root, 'shared');
      await mkdir(shared, { recursive: true });
      out.push(entryOf('Shared', '/shared', await stat(shared), await visibleCount(shared)));
      return out;
    }
    const rows = this.deps.db.select({ id: apps.id }).from(apps).all();
    const out: FileEntry[] = [];
    for (const { id } of rows) {
      const dir = join(this.deps.appDataDir, id);
      const st = await stat(dir).catch(() => null);
      if (!st?.isDirectory()) continue;
      out.push(entryOf(this.places.appName(id), `/appdata/${id}`, st, await visibleCount(dir)));
    }
    return out;
  }

  /** A folder's entries, folders first (US-FILE-02), 200 at a time. */
  async list(caller: Caller, input: { path: string; sort?: Sort; dir?: SortDir; cursor?: string; kinds?: 'folder'[] }) {
    const place = await this.resolve(caller, input.path);
    if (place.area === 'shared' && place.rest.length === 0) await mkdir(place.base!, { recursive: true });
    let all: FileEntry[];
    if (place.base === null) {
      all = await this.placeEntries(place);
    } else {
      const real = await realInside(place.base, place.host!);
      all = await this.entriesOf(place, real, place.virtual);
    }
    if (input.kinds?.length) all = all.filter((e) => e.kind === 'folder');
    const sorted = sortEntries(all, input.sort, input.dir);
    const from = Math.max(0, Number.parseInt(input.cursor ?? '0', 10) || 0);
    const items = this.withPreviews(caller, sorted.slice(from, from + PAGE_SIZE));
    return {
      path: place.virtual,
      crumbs: place.crumbs,
      place: { area: place.area, name: place.name, readOnly: place.readOnly },
      location: locationOf(place, caller),
      items,
      nextCursor: from + PAGE_SIZE < sorted.length ? String(from + PAGE_SIZE) : null,
      count: sorted.length,
      filesBytes: sorted.reduce((n, e) => n + (e.size ?? 0), 0),
    };
  }

  /** One file or folder, with the folder it's in. */
  async stat(caller: Caller, virtual: string) {
    const place = await this.resolve(caller, virtual);
    if (place.base === null || place.rest.length === 0) throw hlabsError('FILES_INVALID_PATH');
    const real = await realInside(place.base, place.host!);
    const st = await stat(real);
    const name = place.rest[place.rest.length - 1]!;
    const children = st.isDirectory() ? await visibleCount(real) : null;
    const entry = entryOf(name, place.virtual, st, children);
    return {
      ...entry,
      dimensions: st.isFile() ? await dimensionsOf(real, entry.mime, st.size) : null,
      parent: place.crumbs.slice(0, -1) as Crumb[],
      readOnly: place.readOnly,
    };
  }

  /** A new folder (US-FILE-03): names are trimmed; "/" or more than 255 bytes is FILES_INVALID_NAME. */
  async mkdir(caller: Caller, input: { path: string; name: string }) {
    const name = input.name.trim();
    if (!validName(name)) throw hlabsError('FILES_INVALID_NAME');
    const place = await this.resolve(caller, input.path);
    if (place.base === null || place.readOnly) throw hlabsError('FILES_READ_ONLY');
    const parent = await realInside(place.base, place.host!);
    const target = join(parent, name);
    if (
      await lstat(target).then(
        () => true,
        () => false,
      )
    )
      throw hlabsError('FILES_NAME_EXISTS', name, { name });
    await mkdir(target).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'EEXIST') throw hlabsError('FILES_NAME_EXISTS', name, { name });
      if (err.code === 'EACCES' || err.code === 'EROFS' || err.code === 'EPERM') throw hlabsError('FILES_READ_ONLY');
      throw err;
    });
    return { path: joinVirtual(place.virtual, name) };
  }

  /**
   * What a rename or move would break (US-FILE-23): apps whose folders are this one or inside it, and network shares of
   * it, by name.
   */
  async usedBy(real: string): Promise<string[]> {
    const rows = this.deps.db
      .select({ name: apps.id, location: storageLocations.path, subpath: appMounts.subpath })
      .from(appMounts)
      .innerJoin(apps, eq(apps.id, appMounts.appId))
      .innerJoin(storageLocations, eq(storageLocations.id, appMounts.storageLocationId))
      .all();
    const names = new Set<string>();
    for (const row of rows) {
      const folder = await realpath(join(row.location, row.subpath)).catch(() => null);
      if (folder && inside(real, folder)) names.add(this.appName(row.name));
    }
    for (const share of this.deps.db.select().from(fileShares).all()) {
      if (inside(real, share.path)) names.add(share.name);
    }
    return [...names];
  }

  /** An app's name from its manifest, else its id. */
  private appName(appId: string): string {
    const row = this.deps.db.select().from(apps).where(eq(apps.id, appId)).get();
    return row ? (catalogManifest(this.deps.db, row).name ?? appId) : appId;
  }

  /**
   * A new name in the same folder (US-FILE-23). Same rules as New folder; a folder something uses needs `force`.
   * Network shares of it follow the new name.
   */
  async rename(caller: Caller, input: { path: string; name: string; force?: boolean }) {
    const name = input.name.trim();
    if (!validName(name)) throw hlabsError('FILES_INVALID_NAME');
    const place = await this.resolve(caller, input.path);
    if (place.base === null || place.rest.length === 0) throw hlabsError('FILES_INVALID_PATH');
    if (place.readOnly) throw hlabsError('FILES_READ_ONLY');
    const real = await realInside(place.base, place.host!);
    const target = join(dirname(real), name);
    const parentVirtual = place.virtual.slice(0, place.virtual.lastIndexOf('/'));
    if (target === real) return { path: place.virtual };
    // Another item of that name; on a case-insensitive disk "bills" → "Bills" is the same item and may go ahead.
    const existing = await realpath(target).catch(() => null);
    if (existing !== null && existing !== real) throw hlabsError('FILES_NAME_EXISTS', name, { name });
    if (!input.force) {
      const apps = await this.usedBy(real);
      if (apps.length) throw hlabsError('FILES_IN_USE', undefined, { apps });
    }
    await rename(real, target).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'EACCES' || err.code === 'EROFS' || err.code === 'EPERM') throw hlabsError('FILES_READ_ONLY');
      if (err.code === 'ENOENT') throw hlabsError('NOT_FOUND');
      throw err;
    });
    for (const share of this.deps.db.select().from(fileShares).all()) {
      if (share.path === real || share.path.startsWith(real + sep)) {
        this.deps.db
          .update(fileShares)
          .set({ path: target + share.path.slice(real.length) })
          .where(eq(fileShares.id, share.id))
          .run();
      }
    }
    return { path: joinVirtual(parentVirtual, name) };
  }

  /**
   * Walks folders below `start`, newest-first or matching, until `budgetMs` runs out. Calls `visit` with each visible
   * file or folder; returns false when the time ran out.
   */
  private async walk(
    place: Place,
    visit: (entry: FileEntry) => boolean | void,
    budgetMs = WALK_BUDGET_MS,
    now: () => number = Date.now,
  ): Promise<boolean> {
    const deadline = now() + budgetMs;
    const realBase = await realpath(place.base!).catch(() => null);
    if (!realBase) return true;
    const start = await realInside(place.base!, place.host!);
    const queue: Array<{ dir: string; virtual: string }> = [{ dir: start, virtual: place.virtual }];
    while (queue.length) {
      if (now() > deadline) return false;
      const { dir, virtual } = queue.shift()!;
      const dirents = await readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[]);
      for (const d of dirents) {
        if (isHidden(d.name)) continue;
        const host = join(dir, d.name);
        if (d.isSymbolicLink()) {
          const real = await realpath(host).catch(() => null);
          // Followed only for files: a linked folder could loop.
          if (!real || !inside(realBase, real)) continue;
        }
        const st = await stat(host).catch(() => null);
        if (!st) continue;
        const path = joinVirtual(virtual, d.name);
        if (st.isDirectory()) {
          if (!d.isSymbolicLink()) queue.push({ dir: host, virtual: path });
          if (visit(entryOf(d.name, path, st, null)) === false) return true;
        } else if (st.isFile()) {
          if (visit(entryOf(d.name, path, st, null)) === false) return true;
        }
      }
    }
    return true;
  }

  /** The 50 most recently changed files in the caller's Home and, when allowed, Shared (US-FILE-01). */
  async recent(caller: Caller) {
    const found: FileEntry[] = [];
    const roots = caller.canSeeShared ? ['/home', '/shared'] : ['/home'];
    for (const root of roots) {
      const place = await this.resolve(caller, root);
      if (place.area === 'shared') await mkdir(place.base!, { recursive: true });
      await this.walk(place, (e) => {
        if (e.kind === 'file') found.push(e);
      });
    }
    const newest = found.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, RECENT_COUNT);
    return { items: this.withPreviews(caller, newest) };
  }

  /** Names containing the query (any case), in the folder and below (US-FILE-04). */
  async search(caller: Caller, input: { path: string; query: string; limit?: number }, now: () => number = Date.now) {
    const limit = input.limit ?? PAGE_SIZE;
    const query = input.query.trim().toLocaleLowerCase();
    const place = await this.resolve(caller, input.path);
    const items: FileEntry[] = [];
    let capped = false;
    const searchOne = async (p: Place) =>
      this.walk(
        p,
        (e) => {
          if (!e.name.toLocaleLowerCase().includes(query)) return;
          if (items.length >= limit) {
            capped = true;
            return false;
          }
          items.push(e);
        },
        WALK_BUDGET_MS,
        now,
      );
    let finished = true;
    if (place.base === null) {
      // The lists of places: search each place in it.
      for (const e of await this.placeEntries(place)) {
        if (capped) break;
        finished = (await searchOne(await this.resolve(caller, e.path))) && finished;
      }
    } else {
      finished = await searchOne(place);
    }
    // Child counts for the folders found, as listings show them.
    for (const e of items) {
      if (e.kind !== 'folder') continue;
      const p = await this.resolve(caller, e.path);
      e.childCount = p.host ? await visibleCount(p.host) : 0;
    }
    return { items: this.withPreviews(caller, items), capped, truncated: !finished };
  }
}

/** Not empty, no "/" (or NUL), not "." or "..", at most 255 bytes (US-FILE-03). */
export function validName(name: string): boolean {
  return (
    name.length > 0 && !/[/\0]/.test(name) && name !== '.' && name !== '..' && Buffer.byteLength(name, 'utf8') <= 255
  );
}
