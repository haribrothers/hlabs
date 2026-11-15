// The Files sidebar (US-FILE-01): which places this person sees, which one is open, and the names the breadcrumb
// gives the tops of places. Pure, so it's tested without rendering.
import { isFeatureEnabled } from '@hlabs/shared';
import type { FileAccent } from '@hlabs/ui/files';
import { filesCopy as copy } from '../copy/files';

export const HOME = '/home';
export const RECENTS = 'recents';

/** Where Files is: a folder (`path`) or Recents. */
export interface FilesLocation {
  path: string;
  view: 'folder' | 'recents';
}

export interface Drive {
  id: string;
  kind: 'local' | 'external' | 'smb' | 'nfs';
  name: string;
  isRoot: boolean;
  status: string;
}

export interface SidebarRow {
  key: string;
  label: string;
  /** Null for Recents. */
  path: string | null;
  /** Drives that aren't mounted show an offline dot (US-FILE-01). */
  offline?: boolean;
  driveId?: string;
}

export interface SidebarGroup {
  key: 'files' | 'locations' | 'other';
  label: string;
  rows: SidebarRow[];
  /** "+ Connect a drive" under Locations (admins). */
  connect?: boolean;
}

/**
 * Admins: Files (Recents, Home, Photos, Downloads, Shared with me), Locations (This computer, each drive, + Connect a
 * drive) and Other (App data, Trash). Members: Recents, Home, Photos, Downloads, Shared with me when allowed, Trash.
 * External drives and Trash wait for phase 8 (D-036).
 */
export function sidebarGroups(
  me: { role: 'admin' | 'member'; canSeeShared: boolean },
  drives: Drive[],
  shippedPhase?: number,
): SidebarGroup[] {
  const admin = me.role === 'admin';
  const trash = isFeatureEnabled('trashScreen', shippedPhase);
  const files: SidebarRow[] = [
    { key: 'recents', label: copy.recents, path: null },
    { key: 'home', label: copy.home, path: HOME },
    { key: 'photos', label: copy.photos, path: `${HOME}/Photos` },
    { key: 'downloads', label: copy.downloads, path: `${HOME}/Downloads` },
  ];
  if (me.canSeeShared) files.push({ key: 'shared', label: copy.sharedWithMe, path: '/shared' });
  if (!admin) {
    return [{ key: 'files', label: copy.groups.files, rows: trash ? [...files, trashRow] : files }];
  }
  const external = isFeatureEnabled('externalDrives', shippedPhase);
  const locations: SidebarRow[] = [
    { key: 'computer', label: copy.thisComputer, path: '/users' },
    ...drives
      .filter((d) => !d.isRoot && (d.kind === 'smb' || d.kind === 'nfs' || (external && d.kind === 'external')))
      .map((d) => ({
        key: `drive:${d.id}`,
        label: d.name,
        path: `/drives/${d.id}`,
        offline: d.status !== 'ok',
        driveId: d.id,
      })),
  ];
  const other: SidebarRow[] = [{ key: 'appdata', label: copy.appData, path: '/appdata' }];
  if (trash) other.push(trashRow);
  return [
    { key: 'files', label: copy.groups.files, rows: files },
    { key: 'locations', label: copy.groups.locations, rows: locations, connect: true },
    { key: 'other', label: copy.groups.other, rows: other },
  ];
}

const trashRow: SidebarRow = { key: 'trash', label: copy.trash, path: null };

/** The sidebar row for where Files is: the deepest place the path is in. */
export function activeRow(at: FilesLocation): string | null {
  if (at.view === 'recents') return 'recents';
  const p = at.path;
  const under = (top: string) => p === top || p.startsWith(`${top}/`);
  if (under(`${HOME}/Photos`)) return 'photos';
  if (under(`${HOME}/Downloads`)) return 'downloads';
  if (under(HOME)) return 'home';
  if (under('/shared')) return 'shared';
  if (under('/users')) return 'computer';
  if (under('/appdata')) return 'appdata';
  const drive = /^\/drives\/([^/]+)/.exec(p);
  return drive ? `drive:${drive[1]}` : null;
}

/** A breadcrumb step's name: its own, or the place's ("Home", "Shared", "This computer", "App data"). */
export const crumbName = (c: { path: string; name: string | null }) => c.name ?? copy.areaNames[c.path] ?? c.path;

export const parentOf = (path: string) => path.slice(0, Math.max(1, path.lastIndexOf('/'))) || '/';

/** The person Files is for, as the views need them. */
export interface FilesMe {
  role: 'admin' | 'member';
  displayName: string;
  canSeeShared: boolean;
  accent: FileAccent;
}
