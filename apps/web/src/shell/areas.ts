import { isFeatureEnabled, type Feature } from '@hlabs/shared';
import { AREA_IDS, type AreaId, type AreaItem } from '@hlabs/ui';
import { areaLabels, phoneAreaLabels } from '../copy/shell';

/** Route path for each area. */
export const AREA_PATHS: Record<AreaId, string> = {
  home: '/',
  store: '/store',
  files: '/files',
  usage: '/usage',
  backups: '/backups',
  settings: '/settings',
};

/** Areas that arrive with a later phase stay hidden until it ships (D-036, US-HOME-04). */
const AREA_FEATURE: Partial<Record<AreaId, Feature>> = {
  store: 'appStore',
  usage: 'liveUsage',
  files: 'files',
  backups: 'backups',
};

const shipped = (id: AreaId, shippedPhase?: number) => {
  const feature = AREA_FEATURE[id];
  return !feature || isFeatureEnabled(feature, shippedPhase);
};

/** Who is looking: members see fewer areas (07 §7.4, US-HOME-05). Without it (signed out, dev pages): all. */
export interface NavAccess {
  role: 'admin' | 'member';
  canSeeUsage: boolean;
  canInstallApps: boolean;
}

export interface NavOptions {
  shippedPhase?: number;
  access?: NavAccess;
}

/** Members: Home, Files, Settings, plus Usage and the App Store when the admin allows them. */
function allowed(id: AreaId, access: NavAccess | undefined): boolean {
  if (!access || access.role === 'admin') return true;
  if (id === 'usage') return access.canSeeUsage;
  if (id === 'store') return access.canInstallApps;
  return id === 'home' || id === 'files' || id === 'settings';
}

const areasFor = (ids: readonly AreaId[], opts: NavOptions) =>
  ids.filter((id) => allowed(id, opts.access) && shipped(id, opts.shippedPhase));

/** The areas shown in the Dock, in their fixed order (D-054). */
export function navigationAreas(opts: NavOptions = {}): AreaItem[] {
  return areasFor(AREA_IDS, opts).map((id) => ({ id, label: areaLabels[id] }));
}

/**
 * The App Store's update badge (US-HOME-05): admins only, from phase 7 when the updates list ships (D-036), and
 * never for 0. Members never ask for updates.
 */
export function storeBadge(updates: number, opts: NavOptions & { shippedPhase?: number }): number | undefined {
  if (opts.access?.role !== 'admin' || !isFeatureEnabled('appUpdates', opts.shippedPhase)) return undefined;
  return updates > 0 ? updates : undefined;
}

/** Phone tabs (US-PHONE-01): Home, Apps, Files, Usage, Settings; Backups lives in Settings there. */
const PHONE_AREAS: AreaId[] = ['home', 'store', 'files', 'usage', 'settings'];

export function phoneAreas(opts: NavOptions = {}): AreaItem[] {
  return areasFor(PHONE_AREAS, opts).map((id) => ({ id, label: phoneAreaLabels[id] }));
}

/** The area a pathname belongs to. */
export function areaForPath(pathname: string): AreaId {
  const match = AREA_IDS.find((id) => id !== 'home' && pathname.startsWith(AREA_PATHS[id]));
  return match ?? 'home';
}
