// Folder access for an app (US-STORE-08): where each manifest folder goes by default, and checking the folders an
// install asks for. `home:<dir>` is the installing person's Home on the storage root, `shared:<dir>` the root's Shared
// folder, `appdata:<dir>` a folder in the app's own data (always on this computer, D-011). Paths are jailed to their
// location: `..` and absolute subpaths are refused, and a folder can't get more access than the manifest asks for.
import { hlabsError } from '@hlabs/api';
import { parseShortVolume, type AppManifest, type ComposeFile } from '@hlabs/app-manifest';
import { storageLocations, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { join, normalize, posix } from 'node:path';

type ManifestFolder = AppManifest['folders'][number];

/** Where a folder is, for people: "Home › Photos", "Shared › Media", "NAS › Photos archive", "App data". */
export interface FolderPlace {
  area: 'home' | 'shared' | 'appdata' | 'location';
  /** The storage location's name, for `location`. */
  locationName: string | null;
  /** The folder inside the area, e.g. "Photos" (empty for the area itself). */
  path: string;
}

export interface FolderDefault {
  /** Null for app data. */
  storageLocationId: string | null;
  subpath: string;
  place: FolderPlace;
  /** False when its location is offline (a NAS that isn't mounted). */
  available: boolean;
}

/** A folder an install asks for (05 `mountSchema`, `target` = the manifest folder's key). */
export interface MountRequest {
  target: string;
  storageLocationId: string;
  subpath: string;
  mode: 'ro' | 'rw';
}

export interface ResolvedMount extends MountRequest {
  /** Absolute path on this computer. */
  hostPath: string;
}

const clean = (subpath: string) => posix.normalize(subpath.replace(/\\/g, '/')).replace(/^\.\/?|\/$/g, '');

/** A subpath that stays inside its location: relative, no `..`. */
export function safeSubpath(subpath: string): string {
  const s = clean(subpath);
  if (s.startsWith('/') || s.split('/').includes('..')) throw hlabsError('VALIDATION_FAILED', `Bad folder ${subpath}`);
  return s === '.' ? '' : s;
}

export function rootLocation(db: HlabsDb) {
  return db.select().from(storageLocations).where(eq(storageLocations.isRoot, true)).get() ?? null;
}

/** Where the manifest wants a folder, for this person; null when it names no default. */
export function defaultFolder(db: HlabsDb, folder: ManifestFolder, username: string): FolderDefault | null {
  if (!folder.default) return null;
  const [area, dir] = folder.default.split(/:(.*)/s) as ['home' | 'shared' | 'appdata', string];
  if (area === 'appdata') {
    return { storageLocationId: null, subpath: dir, place: { area, locationName: null, path: dir }, available: true };
  }
  const root = rootLocation(db);
  if (!root) return null;
  const subpath = area === 'home' ? `users/${username}/${dir}` : `shared/${dir}`;
  return {
    storageLocationId: root.id,
    subpath,
    place: { area, locationName: null, path: dir },
    available: root.status === 'ok',
  };
}

/**
 * Checks the requested folders against the manifest and storage: each is a manifest folder, its location exists,
 * allows apps and is online, its path stays inside the location, and its mode is no more than the manifest's. Required
 * folders must be there, except app-data ones, which need no location.
 */
export function resolveMounts(db: HlabsDb, manifest: AppManifest, requested: MountRequest[]): ResolvedMount[] {
  const byKey = new Map(manifest.folders.map((f) => [f.key, f]));
  const seen = new Set<string>();
  const out: ResolvedMount[] = [];
  for (const m of requested) {
    const folder = byKey.get(m.target);
    if (!folder || seen.has(m.target)) {
      throw hlabsError('VALIDATION_FAILED', `Unknown folder ${m.target}`, { folder: m.target });
    }
    seen.add(m.target);
    const location = db.select().from(storageLocations).where(eq(storageLocations.id, m.storageLocationId)).get();
    if (!location || !location.appsAllowed) {
      throw hlabsError('NOT_FOUND', 'No such storage location', { folder: m.target });
    }
    if (location.status !== 'ok') {
      throw hlabsError('NAS_UNREACHABLE', `${location.name} is offline`, { folder: m.target, location: location.name });
    }
    const subpath = safeSubpath(m.subpath);
    const hostPath = normalize(join(location.path, subpath));
    // `ro` stays `ro` (US-STORE-08: the mode can't be raised above the manifest's).
    const mode = folder.mode === 'ro' ? 'ro' : m.mode;
    out.push({ target: m.target, storageLocationId: location.id, subpath, mode, hostPath });
  }
  for (const f of manifest.folders) {
    const appData = f.default?.startsWith('appdata:');
    if (f.required && !seen.has(f.key) && !appData) {
      throw hlabsError('VALIDATION_FAILED', `Folder ${f.key} is required`, { folder: f.key });
    }
  }
  return out;
}

/** The host path of each manifest folder for rendering: chosen mounts, else app-data defaults. */
export function folderPaths(
  manifest: AppManifest,
  mounts: Array<{ target: string; hostPath: string }>,
  appDataDir: string,
): Record<string, string> {
  const paths: Record<string, string> = {};
  for (const f of manifest.folders) {
    const mount = mounts.find((m) => m.target === f.key);
    if (mount) paths[f.key] = mount.hostPath;
    else if (f.default?.startsWith('appdata:')) paths[f.key] = join(appDataDir, safeSubpath(f.default.slice(8)));
  }
  return paths;
}

const APP_DATA_VAR = /^\$\{HLABS_APP_DATA\}(?:\/(.*))?$/;

/**
 * The folders inside the app's data that its compose file mounts (`${HLABS_APP_DATA}/data:/home/node/.n8n`), as paths
 * on this computer. hlabs creates them before the app starts: left to Docker, Linux creates a missing one as root, and
 * an app that runs as the hlabs user (n8n) can't write to it.
 */
export function appDataBindDirs(compose: ComposeFile, appDataDir: string): string[] {
  const dirs = new Set<string>();
  for (const service of Object.values(compose.services)) {
    for (const volume of service.volumes ?? []) {
      const source = typeof volume === 'string' ? parseShortVolume(volume).source : (volume.source ?? null);
      const match = source ? APP_DATA_VAR.exec(source) : null;
      if (match) dirs.add(match[1] ? join(appDataDir, safeSubpath(match[1])) : appDataDir);
    }
  }
  return [...dirs];
}
