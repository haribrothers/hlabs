// Virtual paths in Files (US-FILE-01, 07-files): what a path means, who may use it and where it is on disk.
//
//   /home/…             the caller's Home folder, <root>/users/<username>
//   /shared/…           <root>/shared: admins, and members with "See the Shared folder in Files"
//   /users              admins: "This computer", every Home folder (by display name) and Shared
//   /users/<folder>/…   admins: <root>/users/<folder> (also kept Homes of deleted people, D-101)
//   /appdata            admins: one folder per installed app (read only)
//   /appdata/<appId>/…  admins: the app's data folder, read only so running apps are safe
//   /drives/<id>/…      admins: a network or external drive (a storage location that isn't the root)
//
// Paths never leave their place: `.` and `..` segments are refused, and a symlink that leads outside is hidden from
// listings and refused (FILES_INVALID_PATH). Access is checked here, whatever the dashboard shows.
import { hlabsError } from '@hlabs/api';
import { apps, storageLocations, users, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { constants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { catalogManifest } from '../apps/list';
import { rootLocation } from '../apps/folders';

export interface Caller {
  id: string;
  role: 'admin' | 'member';
  username: string;
  displayName: string;
  canSeeShared: boolean;
}

export type Area = 'home' | 'shared' | 'users' | 'user' | 'appdata' | 'app' | 'drive';

export interface Crumb {
  path: string;
  name: string | null;
}

export interface Place {
  /** The path, tidied: `/home/Documents`. */
  virtual: string;
  area: Area;
  /** The owner's display name, the app's name or the drive's name. */
  name: string | null;
  /** The place's top on disk; null for the lists of places (`/users`, `/appdata`). */
  base: string | null;
  /** Where the path is on disk (not yet checked for symlinks); null for the lists of places. */
  host: string | null;
  /** The virtual path of the place's top (`/home`, `/users/anu`, `/drives/<id>`). */
  top: string;
  /** Segments below the top. */
  rest: string[];
  readOnly: boolean;
  /** The storage location it is on (the root, or the drive); null for app data and the lists of places. */
  locationId: string | null;
  crumbs: Crumb[];
}

/** Names that never show: hidden files, hlabs's partial uploads (`.<name>.hlabs-part`) and the Trash (`.trash`). */
export const isHidden = (name: string) => name.startsWith('.');

/** Splits and checks a virtual path. */
export function segmentsOf(virtual: string): string[] {
  if (!virtual.startsWith('/') || virtual.includes('\0')) throw hlabsError('FILES_INVALID_PATH');
  const parts = virtual.split('/').filter((s) => s !== '');
  if (parts.some((s) => s === '.' || s === '..')) throw hlabsError('FILES_INVALID_PATH');
  return parts;
}

export const joinVirtual = (parent: string, name: string) => (parent === '/' ? `/${name}` : `${parent}/${name}`);

export interface PlacesDeps {
  db: HlabsDb;
  appDataDir: string;
}

export class Places {
  constructor(private readonly deps: PlacesDeps) {}

  /** The caller's own record, for access checks. */
  caller(userId: string, role: 'admin' | 'member'): Caller {
    const user = this.deps.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw hlabsError('AUTH_REQUIRED');
    return {
      id: user.id,
      role,
      username: user.username,
      displayName: user.displayName,
      canSeeShared: role === 'admin' || user.canSeeShared,
    };
  }

  /** The storage root's folder; Files needs one (set in onboarding). */
  rootPath(): string {
    const root = rootLocation(this.deps.db);
    if (!root) throw hlabsError('NOT_FOUND', 'No storage root');
    return root.path;
  }

  appName(appId: string): string {
    const app = this.deps.db.select().from(apps).where(eq(apps.id, appId)).get();
    return app ? (catalogManifest(this.deps.db, app).name ?? app.id) : appId;
  }

  /** Display names by Home folder name, for `/users`. */
  displayNames(): Map<string, string> {
    return new Map(
      this.deps.db
        .select({ username: users.username, displayName: users.displayName })
        .from(users)
        .all()
        .map((u) => [u.username, u.displayName]),
    );
  }

  /** Resolves a virtual path for a caller, or throws FILES_ACCESS_DENIED / FILES_INVALID_PATH / NOT_FOUND. */
  async resolve(caller: Caller, virtual: string): Promise<Place> {
    const parts = segmentsOf(virtual);
    const [first, second, ...more] = parts;
    const admin = caller.role === 'admin';
    const tidy = `/${parts.join('/')}`;
    const crumbsBelow = (top: string, start: Crumb[], rest: string[]) => {
      const out = [...start];
      let path = top;
      for (const seg of rest) {
        path = joinVirtual(path, seg);
        out.push({ path, name: seg });
      }
      return out;
    };
    const place = (p: Omit<Place, 'virtual' | 'host' | 'crumbs'> & { start: Crumb[] }): Place => ({
      virtual: tidy,
      area: p.area,
      name: p.name,
      base: p.base,
      host: p.base === null ? null : join(p.base, ...p.rest),
      top: p.top,
      rest: p.rest,
      readOnly: p.readOnly,
      locationId: p.locationId,
      crumbs: crumbsBelow(p.top, p.start, p.rest),
    });

    switch (first) {
      case 'home': {
        const root = rootLocation(this.deps.db);
        if (!root) throw hlabsError('NOT_FOUND', 'No storage root');
        const rest = parts.slice(1);
        return place({
          area: 'home',
          name: caller.displayName,
          base: join(root.path, 'users', caller.username),
          top: '/home',
          rest,
          readOnly: false,
          locationId: root.id,
          start: [{ path: '/home', name: null }],
        });
      }
      case 'shared': {
        if (!caller.canSeeShared) throw hlabsError('FILES_ACCESS_DENIED');
        const root = rootLocation(this.deps.db);
        if (!root) throw hlabsError('NOT_FOUND', 'No storage root');
        return place({
          area: 'shared',
          name: null,
          base: join(root.path, 'shared'),
          top: '/shared',
          rest: parts.slice(1),
          readOnly: false,
          locationId: root.id,
          start: [{ path: '/shared', name: null }],
        });
      }
      case 'users': {
        if (!admin) throw hlabsError('FILES_ACCESS_DENIED');
        const root = rootLocation(this.deps.db);
        if (!root) throw hlabsError('NOT_FOUND', 'No storage root');
        const start: Crumb[] = [{ path: '/users', name: null }];
        if (second === undefined) {
          return place({
            area: 'users',
            name: null,
            base: null,
            top: '/users',
            rest: [],
            readOnly: true,
            locationId: null,
            start,
          });
        }
        if (isHidden(second)) throw hlabsError('FILES_INVALID_PATH');
        const name = this.displayNames().get(second) ?? second;
        const top = `/users/${second}`;
        return place({
          area: 'user',
          name,
          base: join(root.path, 'users', second),
          top,
          rest: more,
          readOnly: false,
          locationId: root.id,
          start: [...start, { path: top, name }],
        });
      }
      case 'appdata': {
        if (!admin) throw hlabsError('FILES_ACCESS_DENIED');
        const start: Crumb[] = [{ path: '/appdata', name: null }];
        if (second === undefined) {
          return place({
            area: 'appdata',
            name: null,
            base: null,
            top: '/appdata',
            rest: [],
            readOnly: true,
            locationId: null,
            start,
          });
        }
        if (!this.deps.db.select({ id: apps.id }).from(apps).where(eq(apps.id, second)).get()) {
          throw hlabsError('NOT_FOUND', 'No such app');
        }
        const name = this.appName(second);
        const top = `/appdata/${second}`;
        return place({
          area: 'app',
          name,
          base: join(this.deps.appDataDir, second),
          top,
          rest: more,
          readOnly: true,
          locationId: null,
          start: [...start, { path: top, name }],
        });
      }
      case 'drives': {
        if (!admin) throw hlabsError('FILES_ACCESS_DENIED');
        if (second === undefined) throw hlabsError('FILES_INVALID_PATH');
        const loc = this.deps.db.select().from(storageLocations).where(eq(storageLocations.id, second)).get();
        if (!loc || loc.isRoot) throw hlabsError('NOT_FOUND', 'No such drive');
        if (loc.status !== 'ok') {
          throw hlabsError('NAS_UNREACHABLE', `${loc.name} is offline`, { reason: 'unreachable', location: loc.name });
        }
        const top = `/drives/${loc.id}`;
        const writable = await access(loc.path, constants.W_OK).then(
          () => true,
          () => false,
        );
        return place({
          area: 'drive',
          name: loc.name,
          base: loc.path,
          top,
          rest: more,
          readOnly: !writable,
          locationId: loc.id,
          start: [{ path: top, name: loc.name }],
        });
      }
      default:
        throw hlabsError('FILES_INVALID_PATH');
    }
  }
}

/**
 * The storage location and subpath a place is (US-FILE-25): Home and Shared are on the storage root
 * (`users/<username>/…`, `shared/…`), a drive is its own location; null for App data and the lists of places.
 */
export function locationOf(place: Place, caller: Pick<Caller, 'username'>): { id: string; subpath: string } | null {
  if (!place.locationId) return null;
  const top =
    place.area === 'home'
      ? ['users', caller.username]
      : place.area === 'shared'
        ? ['shared']
        : place.area === 'user'
          ? ['users', place.top.split('/')[2]!]
          : place.area === 'drive'
            ? []
            : null;
  return top ? { id: place.locationId, subpath: [...top, ...place.rest].join('/') } : null;
}

/** True when `real` is `base` or inside it. */
export const inside = (base: string, real: string) =>
  real === base || real.startsWith(base.endsWith(sep) ? base : base + sep);

/**
 * The real path of `host`, checked to be inside `base` (symlinks followed). Missing → NOT_FOUND; outside →
 * FILES_INVALID_PATH.
 */
export async function realInside(base: string, host: string): Promise<string> {
  const realBase = await realpath(base).catch(() => {
    throw hlabsError('NOT_FOUND', 'No such folder');
  });
  const real = await realpath(host).catch(() => {
    throw hlabsError('NOT_FOUND', 'No such file or folder');
  });
  if (!inside(realBase, real)) throw hlabsError('FILES_INVALID_PATH');
  return real;
}
