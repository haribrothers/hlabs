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

/** The areas shown in the Dock, in their fixed order (D-054). */
export function navigationAreas(opts: { shippedPhase?: number } = {}): AreaItem[] {
  return AREA_IDS.filter((id) => shipped(id, opts.shippedPhase)).map((id) => ({ id, label: areaLabels[id] }));
}

/** Phone tabs (US-PHONE-01): Home, Apps, Files, Usage, Settings; Backups lives in Settings there. */
const PHONE_AREAS: AreaId[] = ['home', 'store', 'files', 'usage', 'settings'];

export function phoneAreas(opts: { shippedPhase?: number } = {}): AreaItem[] {
  return PHONE_AREAS.filter((id) => shipped(id, opts.shippedPhase)).map((id) => ({ id, label: phoneAreaLabels[id] }));
}

/** The area a pathname belongs to. */
export function areaForPath(pathname: string): AreaId {
  const match = AREA_IDS.find((id) => id !== 'home' && pathname.startsWith(AREA_PATHS[id]));
  return match ?? 'home';
}
