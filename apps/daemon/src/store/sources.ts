// App sources beyond the built-in store (US-STORE-18, 19, 27, 28; D-149, D-160): a git repository or a web address that
// publishes a library's index.json, or a folder under the storage root. hlabs reads a source as a whole, checks every
// app with the store's validator (digests optional), and swaps its catalogue in one transaction, so a failed sync
// keeps the previous one. A signed source's key is pinned when it's added: a later index signed with another key
// stops the source ("Signature doesn't match the saved key") until it's removed and added again.
import { hlabsCodeOf, hlabsError, type HlabsCode } from '@hlabs/api';
import { StoreIndex } from '@hlabs/app-manifest';
import {
  appFiles,
  checkLibrary,
  copyAppToLibrary,
  copyReadme,
  INDEX_FILE,
  LibraryError,
  PUBLIC_KEY_FILE,
  renamedManifest,
  SIGNATURE_FILE,
  type LibraryProblem,
} from '@hlabs/app-manifest/library';
import { COMPOSE_FILE, keyFingerprint, loadAppDir, MANIFEST_FILE, verifyIndex } from '@hlabs/app-manifest/node';
import { appSources, catalogApps, users, type HlabsDb } from '@hlabs/db';
import { and, eq, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Logger } from '../logger';
import { BUILTIN_SOURCE_ID, type CatalogService } from './catalog';
import { zip } from './zip';

/** How long a copy's zip waits to be downloaded (one use). */
export const ZIP_TTL_MS = 5 * 60_000;

/** Limits on what a remote source may send. */
export const LIMITS = { indexBytes: 1_000_000, fileBytes: 256_000, logoBytes: 512_000, apps: 300, timeoutMs: 15_000 };

export type SourceKind = 'builtin' | 'git' | 'index' | 'local';

/** Where a source's files are, worked out from what an admin typed. */
export type Location =
  | { kind: 'local'; path: string }
  | {
      kind: 'git' | 'index';
      url: string;
      /** Ends with "/": index.json and the app files are relative to it. */ base: string;
    };

export interface Inspected {
  kind: 'git' | 'index' | 'local';
  /** What's saved and shown: the folder path or the address as typed (tidied). */
  url: string;
  name: string;
  appCount: number;
  signed: boolean;
  keyFingerprint: string | null;
}

export interface SourceView {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  appCount: number;
  lastSyncedAt: number | null;
  /** An hlabs error code from the last sync, for the dashboard to say in words. */
  lastError: HlabsCode | null;
  /** Off after a signature mismatch, until removed and added again. */
  enabled: boolean;
  signed: boolean;
  keyFingerprint: string | null;
  problems: LibraryProblem[];
  removable: boolean;
  /** A local folder's place in Files, when Files shows it (`/home/my-apps`, `/users/hari/my-apps`). */
  filesPath: string | null;
}

type Fetch = (url: string, init: { signal: AbortSignal; redirect: 'follow' }) => Promise<Response>;

export interface SourcesDeps {
  db: HlabsDb;
  catalog: CatalogService;
  logger: Logger;
  /** Where remote sources are cached: `<dataDir>/sources/<id>/`. */
  dataDir: string;
  /** The storage root on disk, or null before it's chosen: local libraries must be under it. */
  storageRoot: () => string | null;
  fetch?: Fetch;
  now?: () => number;
}

const RAW_HOSTS: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /^https:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/,
    (m) => `https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/`,
  ],
  [
    /^https:\/\/gitlab\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/,
    (m) => `https://gitlab.com/${m[1]}/${m[2]}/-/raw/HEAD/`,
  ],
  [
    /^https:\/\/codeberg\.org\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/,
    (m) => `https://codeberg.org/${m[1]}/${m[2]}/raw/branch/main/`,
  ],
];

/** Sha-256 over the manifest and compose file, as index.json's `digest`. */
const digestOf = (manifest: Buffer, compose: Buffer) =>
  `sha256:${createHash('sha256').update(manifest).update(compose).digest('hex')}`;

/** "my-apps" → "My apps". */
/** A folder as people know it: the home folder as `~` (`~/hlabs/users/hari/my-apps`). */
const tildify = (path: string) => {
  const home = homedir();
  return path === home || path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
};

const nameFromFolder = (path: string) => {
  const words = basename(path).replace(/[-_]+/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'My apps';
};

export class SourcesService {
  /** Copies waiting to be downloaded: token → the zip and its file name. */
  private readonly zips = new Map<string, { data: Buffer; name: string; until: number }>();

  constructor(private readonly deps: SourcesDeps) {}

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  /** What an admin typed: an https address (a git repository or where index.json is) or a folder under the root. */
  locate(input: string): Location {
    const raw = input.trim();
    if (raw.startsWith('/') || raw.startsWith('~')) {
      const path = resolve(raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw);
      return { kind: 'local', path };
    }
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw hlabsError('SOURCE_ADDRESS_INVALID');
    }
    if (url.protocol !== 'https:' || url.username || url.password) throw hlabsError('SOURCE_ADDRESS_INVALID');
    const tidy = url.toString().replace(/\/$/, '');
    for (const [re, raw] of RAW_HOSTS) {
      const m = tidy.match(re);
      if (m) return { kind: 'git', url: tidy, base: raw(m) };
    }
    const base = tidy.endsWith(`/${INDEX_FILE}`) ? tidy.slice(0, -INDEX_FILE.length) : `${tidy}/`;
    return { kind: 'index', url: tidy, base };
  }

  /** A folder library must be under the storage root, and not where a member could change it (Shared, their Home). */
  private checkFolder(path: string): string {
    const root = this.deps.storageRoot();
    let real: string;
    try {
      real = realpathSync(path);
    } catch {
      throw hlabsError('SOURCE_EMPTY');
    }
    const realRoot = root ? realpathSync(root) : null;
    if (!realRoot || (real !== realRoot && !real.startsWith(realRoot + sep))) throw hlabsError('SOURCE_PATH_OUTSIDE');
    const [top, owner] = relative(realRoot, real).split(sep);
    if (top === 'shared') throw hlabsError('SOURCE_PATH_SHARED');
    if (top === 'users' && owner) {
      const user = this.deps.db.select({ role: users.role }).from(users).where(eq(users.username, owner)).get();
      if (user?.role !== 'admin') throw hlabsError('SOURCE_PATH_SHARED');
    }
    return real;
  }

  private async get(url: string, limit: number, optional = false): Promise<Buffer | null> {
    const fetchFn = this.deps.fetch ?? (fetch as unknown as Fetch);
    let res: Response;
    try {
      res = await fetchFn(url, { signal: AbortSignal.timeout(LIMITS.timeoutMs), redirect: 'follow' });
    } catch {
      throw hlabsError('SOURCE_UNREACHABLE');
    }
    if (res.url && !res.url.startsWith('https://')) throw hlabsError('SOURCE_UNREACHABLE');
    if (res.status === 404 && optional) return null;
    if (res.status === 404) throw hlabsError('SOURCE_EMPTY');
    if (!res.ok) throw hlabsError('SOURCE_UNREACHABLE');
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > limit) throw hlabsError('SOURCE_INVALID', `more than ${limit} bytes at ${url}`);
    return body;
  }

  private parseIndex(bytes: Buffer): StoreIndex {
    try {
      const parsed = StoreIndex.safeParse(JSON.parse(bytes.toString('utf8')));
      if (parsed.success && parsed.data.apps.length) return parsed.data;
    } catch {
      // Not JSON: no hlabs apps here.
    }
    throw hlabsError('SOURCE_EMPTY');
  }

  /** A remote source's index, signature and published public key (when it has them). */
  private async remoteIndex(base: string) {
    const index = await this.get(base + INDEX_FILE, LIMITS.indexBytes);
    const [signature, publicKey] = await Promise.all([
      this.get(base + SIGNATURE_FILE, 4_096, true),
      this.get(base + PUBLIC_KEY_FILE, 4_096, true),
    ]);
    return {
      bytes: index!,
      index: this.parseIndex(index!),
      signature: signature?.toString('utf8') ?? null,
      publicKey: publicKey?.toString('utf8') ?? null,
    };
  }

  /** A folder library's index files, when it has them. */
  private localIndex(path: string) {
    const read = (f: string) => (existsSync(join(path, f)) ? readFileSync(join(path, f)) : null);
    const bytes = read(INDEX_FILE);
    return {
      bytes,
      index: bytes ? this.parseIndex(bytes) : null,
      signature: read(SIGNATURE_FILE)?.toString('utf8') ?? null,
      publicKey: read(PUBLIC_KEY_FILE)?.toString('utf8') ?? null,
    };
  }

  /** "Trust this source?" (US-STORE-19): its name, how many apps, and its key's fingerprint when it's signed. */
  async inspect(input: string): Promise<Inspected> {
    const { publicKey: _key, ...seen } = await this.inspectWithKey(input);
    return seen;
  }

  private async inspectWithKey(input: string): Promise<Inspected & { publicKey: string | null }> {
    const loc = this.locate(input);
    if (loc.kind === 'local') {
      const path = this.checkFolder(loc.path);
      const { apps } = checkLibrary(path);
      const idx = this.localIndex(path);
      if (!apps.length) throw hlabsError('SOURCE_EMPTY');
      const signed = this.signedWith(idx);
      return {
        kind: 'local',
        url: path,
        name: idx.index?.source.name ?? nameFromFolder(path),
        appCount: apps.filter((a) => a.issues.length === 0).length,
        signed: signed !== null,
        keyFingerprint: signed ? keyFingerprint(signed) : null,
        publicKey: signed,
      };
    }
    const idx = await this.remoteIndex(loc.base);
    const signed = this.signedWith(idx);
    return {
      kind: loc.kind,
      url: loc.url,
      name: idx.index.source.name,
      appCount: idx.index.apps.length,
      signed: signed !== null,
      keyFingerprint: signed ? keyFingerprint(signed) : null,
      publicKey: signed,
    };
  }

  /** The published key when it signs the index; a signature that doesn't match its own key is refused outright. */
  private signedWith(idx: { bytes: Buffer | null; signature: string | null; publicKey: string | null }): string | null {
    if (!idx.signature) return null;
    if (!idx.bytes || !idx.publicKey || !verifyIndex(idx.bytes, idx.signature, idx.publicKey)) {
      throw hlabsError('SOURCE_SIGNATURE_MISMATCH');
    }
    return idx.publicKey;
  }

  /**
   * Adds a source the admin confirmed (US-STORE-19): the key seen in "Trust this source?" is pinned; if the source now
   * shows another, nothing is saved. The first sync runs before it's listed.
   */
  async add(input: { url: string; keyFingerprint: string | null }): Promise<{ sourceId: string }> {
    const { db } = this.deps;
    const loc = this.locate(input.url);
    const typed = loc.kind === 'local' ? loc.path : loc.url;
    if (db.select().from(appSources).where(eq(appSources.url, typed)).get()) throw hlabsError('SOURCE_EXISTS');
    const seen = await this.inspectWithKey(input.url);
    if (seen.keyFingerprint !== input.keyFingerprint) throw hlabsError('SOURCE_SIGNATURE_MISMATCH');
    if (db.select().from(appSources).where(eq(appSources.url, seen.url)).get()) throw hlabsError('SOURCE_EXISTS');
    const id = this.newId(seen.name);
    db.insert(appSources)
      .values({ id, name: seen.name, url: seen.url, kind: seen.kind, enabled: true, publicKey: seen.publicKey })
      .run();
    const view = await this.sync(id);
    if (view.lastError) {
      db.delete(appSources).where(eq(appSources.id, id)).run();
      this.removeCache(id);
      throw hlabsError(view.lastError);
    }
    return { sourceId: id };
  }

  private newId(name: string): string {
    const slug =
      name
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30) || 'source';
    const taken = new Set(
      this.deps.db
        .select({ id: appSources.id })
        .from(appSources)
        .all()
        .map((s) => s.id),
    );
    taken.add(BUILTIN_SOURCE_ID).add('dev');
    if (!taken.has(slug)) return slug;
    for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
  }

  /**
   * Removes a source and its catalogue (US-STORE-18). Installed apps from it stay installed and keep working; with no
   * source they get no updates ("Source removed · no updates").
   */
  remove(sourceId: string): void {
    if (sourceId === BUILTIN_SOURCE_ID) throw hlabsError('SOURCE_BUILTIN');
    const { db } = this.deps;
    const row = db.select().from(appSources).where(eq(appSources.id, sourceId)).get();
    if (!row) throw hlabsError('NOT_FOUND');
    db.delete(appSources).where(eq(appSources.id, sourceId)).run();
    this.removeCache(sourceId);
  }

  private cacheDir(sourceId: string) {
    return join(this.deps.dataDir, 'sources', sourceId);
  }

  private removeCache(sourceId: string) {
    rmSync(this.cacheDir(sourceId), { recursive: true, force: true });
  }

  /** Every source the admin added, enabled, synced (each on its own: one failing doesn't stop the rest). */
  async syncAll(): Promise<void> {
    const rows = this.deps.db.select().from(appSources).all();
    for (const row of rows) {
      if (row.id === BUILTIN_SOURCE_ID || row.kind === 'builtin' || !row.enabled) continue;
      try {
        await this.sync(row.id);
      } catch (err) {
        this.deps.logger.warn({ err, sourceId: row.id }, 'source sync failed');
      }
    }
  }

  /**
   * "Check now" (US-STORE-18): reads the source, checks every app and swaps its catalogue in one go. A failure keeps
   * the previous catalogue and says why on the row; a signature that doesn't match the pinned key turns the source off.
   */
  async sync(sourceId: string): Promise<SourceView> {
    const { db, catalog } = this.deps;
    const row = db.select().from(appSources).where(eq(appSources.id, sourceId)).get();
    if (!row) throw hlabsError('NOT_FOUND');
    if (row.id === BUILTIN_SOURCE_ID) {
      catalog.syncBuiltin(this.now());
      return this.view(row.id);
    }
    try {
      const { dir, problems, leaveOut } = row.kind === 'local' ? this.readLocal(row) : await this.fetchRemote(row);
      catalog.replaceSource(row.id, dir, this.now(), leaveOut);
      db.update(appSources)
        .set({ lastSyncedAt: this.now(), lastError: null, problemsJson: problems })
        .where(eq(appSources.id, row.id))
        .run();
    } catch (err) {
      const raw = hlabsCodeOf(err);
      const code: HlabsCode = raw.startsWith('SOURCE_') ? raw : 'SOURCE_INVALID';
      this.deps.logger.warn({ err, sourceId }, 'source sync failed; the previous catalogue stays');
      db.update(appSources)
        .set({ lastError: code, ...(code === 'SOURCE_SIGNATURE_MISMATCH' ? { enabled: false } : {}) })
        .where(eq(appSources.id, row.id))
        .run();
    }
    return this.view(row.id);
  }

  /** A pinned key must still sign the index; a source that was unsigned stays as it was. */
  private checkPinned(row: typeof appSources.$inferSelect, idx: { bytes: Buffer | null; signature: string | null }) {
    if (!row.publicKey) return;
    if (!idx.bytes || !idx.signature || !verifyIndex(idx.bytes, idx.signature, row.publicKey)) {
      throw hlabsError('SOURCE_SIGNATURE_MISMATCH');
    }
  }

  /** A folder, read as it is now: a signed one only with apps whose files still match the signed index. */
  private readLocal(row: typeof appSources.$inferSelect): {
    dir: string;
    problems: LibraryProblem[];
    leaveOut: Set<string>;
  } {
    const path = this.checkFolder(row.url);
    const idx = this.localIndex(path);
    this.checkPinned(row, idx);
    const { apps, problems } = checkLibrary(path);
    if (!apps.length) throw hlabsError('SOURCE_EMPTY');
    const leaveOut = new Set<string>();
    if (row.publicKey && idx.index) {
      const signed = new Map(idx.index.apps.map((a) => [a.id, a.digest]));
      for (const a of apps.filter((x) => x.issues.length === 0)) {
        const id = basename(a.dir);
        const digest = digestOf(readFileSync(join(a.dir, MANIFEST_FILE)), readFileSync(join(a.dir, COMPOSE_FILE)));
        if (signed.get(id) !== digest) {
          leaveOut.add(id);
          problems.push({
            appId: id,
            file: `apps/${id}`,
            message: 'Changed since the index was signed: run hlabs library index and sign.',
          });
        }
      }
    }
    return { dir: path, problems, leaveOut };
  }

  /** A remote source, fetched whole into a new folder, then put in place of the old one. */
  private async fetchRemote(
    row: typeof appSources.$inferSelect,
  ): Promise<{ dir: string; problems: LibraryProblem[]; leaveOut: Set<string> }> {
    const loc = this.locate(row.url);
    if (loc.kind === 'local') throw hlabsError('SOURCE_INVALID');
    const idx = await this.remoteIndex(loc.base);
    this.checkPinned(row, idx);
    const apps = idx.index.apps.slice(0, LIMITS.apps);
    const target = this.cacheDir(row.id);
    const next = `${target}.new`;
    rmSync(next, { recursive: true, force: true });
    mkdirSync(join(next, 'apps'), { recursive: true });
    const problems: LibraryProblem[] = [];
    const within = (file: string) => {
      const url = new URL(file, loc.base).toString();
      if (!url.startsWith('https://')) throw hlabsError('SOURCE_INVALID');
      return url;
    };
    for (const app of apps) {
      const appDir = join(next, 'apps', app.id);
      try {
        const [manifest, compose] = await Promise.all([
          this.get(within(app.manifestUrl), LIMITS.fileBytes),
          this.get(within(app.composeUrl), LIMITS.fileBytes),
        ]);
        if (digestOf(manifest!, compose!) !== app.digest) {
          problems.push({ appId: app.id, file: `apps/${app.id}`, message: "Its files don't match index.json." });
          continue;
        }
        mkdirSync(appDir, { recursive: true });
        writeFileSync(join(appDir, MANIFEST_FILE), manifest!);
        writeFileSync(join(appDir, COMPOSE_FILE), compose!);
        const logo = loadAppDir(appDir, { requireDigest: false }).manifest?.icon?.logo;
        if (logo && !/^https:\/\//.test(logo) && app.logoUrl) {
          const bytes = await this.get(within(app.logoUrl), LIMITS.logoBytes, true);
          if (bytes) {
            const file = join(appDir, logo.replace(/^\.\//, ''));
            if (!resolve(file).startsWith(resolve(appDir) + sep)) throw hlabsError('SOURCE_INVALID');
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, bytes);
          }
        }
      } catch (err) {
        if (hlabsCodeOf(err) === 'SOURCE_UNREACHABLE') throw err;
        rmSync(appDir, { recursive: true, force: true });
        problems.push({ appId: app.id, file: `apps/${app.id}`, message: "Couldn't be read." });
      }
    }
    const checked = checkLibrary(next);
    for (const p of checked.problems) problems.push(p);
    // The new copy replaces the old one only now, whole.
    rmSync(`${target}.old`, { recursive: true, force: true });
    if (existsSync(target)) renameSync(target, `${target}.old`);
    renameSync(next, target);
    rmSync(`${target}.old`, { recursive: true, force: true });
    return { dir: target, problems, leaveOut: new Set<string>() };
  }

  /** One source as App sources shows it. */
  view(sourceId: string): SourceView {
    const row = this.deps.db.select().from(appSources).where(eq(appSources.id, sourceId)).get();
    if (!row) throw hlabsError('NOT_FOUND');
    return this.toView(row);
  }

  list(): SourceView[] {
    const rows = this.deps.db
      .select()
      .from(appSources)
      .where(sql`${appSources.id} != 'dev'`)
      .all();
    const order = (r: typeof appSources.$inferSelect) => (r.id === BUILTIN_SOURCE_ID ? 0 : 1);
    return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name)).map((r) => this.toView(r));
  }

  private toView(row: typeof appSources.$inferSelect): SourceView {
    const builtin = row.id === BUILTIN_SOURCE_ID;
    const appCount = this.deps.db
      .select({ n: sql<number>`count(*)` })
      .from(catalogApps)
      .where(and(eq(catalogApps.sourceId, row.id)))
      .get()!.n;
    return {
      id: row.id,
      name: builtin ? 'hlabs official' : row.name,
      url: builtin ? '' : row.kind === 'local' ? tildify(row.url) : row.url,
      kind: row.kind as SourceKind,
      appCount,
      lastSyncedAt: row.lastSyncedAt,
      lastError: (row.lastError as HlabsCode | null) ?? null,
      enabled: row.enabled,
      // The built-in store ships with hlabs, signed with it.
      signed: builtin || row.publicKey !== null,
      keyFingerprint: row.publicKey ? keyFingerprint(row.publicKey) : null,
      problems: builtin ? [] : row.problemsJson,
      removable: !builtin,
      filesPath: row.kind === 'local' ? this.filesPathOf(row.url) : null,
    };
  }

  /** A folder's place in Files: in a Home folder (`/users/<name>/…`), else none (Files doesn't show the root). */
  private filesPathOf(path: string): string | null {
    const root = this.deps.storageRoot();
    if (!root || !isAbsolute(path)) return null;
    let rel: string;
    try {
      rel = relative(realpathSync(root), realpathSync(path));
    } catch {
      return null;
    }
    const parts = rel.split(sep);
    if (parts[0] === 'users' && parts[1] && statSync(path).isDirectory()) return `/users/${parts.slice(1).join('/')}`;
    return null;
  }

  /**
   * "Copy to my library" (US-STORE-29): the app's manifest (new id), compose file and logo, with a README saying where
   * it came from. Into a folder library: written there and synced, so it's in the store at once. Into a git library: a
   * zip to add to the repository.
   */
  async copyToLibrary(input: { appId: string; sourceId?: string; libraryId: string; newId: string }) {
    const { db, catalog } = this.deps;
    const fromSource = input.sourceId ?? this.sourceOf(input.appId);
    const fromRoot = fromSource ? catalog.dirOf(fromSource) : null;
    const fromDir = fromRoot ? join(fromRoot, 'apps', input.appId) : null;
    if (!fromSource || !fromDir || !existsSync(fromDir)) throw hlabsError('NOT_FOUND');
    const library = db.select().from(appSources).where(eq(appSources.id, input.libraryId)).get();
    if (!library || library.id === BUILTIN_SOURCE_ID) throw hlabsError('NOT_FOUND');
    const clash = () => hlabsError('LIBRARY_APP_EXISTS', undefined, { id: input.newId, library: library.name });
    const taken = db
      .select()
      .from(catalogApps)
      .where(and(eq(catalogApps.sourceId, library.id), eq(catalogApps.appId, input.newId)))
      .get();
    if (taken) throw clash();
    const fromName = this.toView(db.select().from(appSources).where(eq(appSources.id, fromSource)).get()!).name;

    if (library.kind === 'local') {
      const libraryDir = this.checkFolder(library.url);
      try {
        copyAppToLibrary({ fromDir, libraryDir, newId: input.newId, fromSource: fromName, now: new Date(this.now()) });
      } catch (err) {
        if (err instanceof LibraryError && err.message === 'exists') throw clash();
        throw err;
      }
      await this.sync(library.id);
      return { kind: 'folder' as const, appId: input.newId, path: join(libraryDir, 'apps', input.newId) };
    }

    const manifest = catalog.get(input.appId, fromSource)?.manifest;
    if (!manifest) throw hlabsError('NOT_FOUND');
    const files = appFiles(fromDir).map((file) => {
      const data = readFileSync(join(fromDir, file));
      return {
        path: `apps/${input.newId}/${file}`,
        data: file === MANIFEST_FILE ? Buffer.from(renamedManifest(data.toString('utf8'), input.newId)) : data,
      };
    });
    files.push({
      path: `apps/${input.newId}/README.md`,
      data: Buffer.from(
        copyReadme({
          name: manifest.name,
          fromId: manifest.id,
          fromSource: fromName,
          version: manifest.version,
          at: new Date(this.now()),
        }),
      ),
    });
    const token = randomBytes(24).toString('base64url');
    this.dropOldZips();
    this.zips.set(token, {
      data: zip(files, new Date(this.now())),
      name: `${input.newId}.zip`,
      until: this.now() + ZIP_TTL_MS,
    });
    return { kind: 'zip' as const, url: `/api/store/copy/${token}.zip` };
  }

  /** A copy's zip, once: gone after it's taken or after 5 minutes. */
  takeZip(token: string): { data: Buffer; name: string } | null {
    this.dropOldZips();
    const z = this.zips.get(token);
    if (!z) return null;
    this.zips.delete(token);
    return { data: z.data, name: z.name };
  }

  private dropOldZips() {
    for (const [t, z] of this.zips) if (z.until < this.now()) this.zips.delete(t);
  }

  /** The source an app id comes from (its first catalogue row, built-in first). */
  sourceOf(appId: string): string | null {
    const rows = this.deps.db
      .select({ sourceId: catalogApps.sourceId })
      .from(catalogApps)
      .where(eq(catalogApps.appId, appId))
      .all();
    return rows.find((r) => r.sourceId === BUILTIN_SOURCE_ID)?.sourceId ?? rows[0]?.sourceId ?? null;
  }
}
