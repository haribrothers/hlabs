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

/**
 * The areas shown in the Dock and tab bar, in their fixed order (D-054).
 * Member filtering (Home, Files, Settings) arrives with roles in phase 1.
 */
export function navigationAreas(): AreaItem[] {
  return AREA_IDS.map((id) => ({ id, label: areaLabels[id] }));
}

/** Phone tabs (US-PHONE-01): Home, Apps, Files, Usage, Settings; Backups lives in Settings there. */
const PHONE_AREAS: AreaId[] = ['home', 'store', 'files', 'usage', 'settings'];

export function phoneAreas(): AreaItem[] {
  return PHONE_AREAS.map((id) => ({ id, label: phoneAreaLabels[id] }));
}

/** The area a pathname belongs to. */
export function areaForPath(pathname: string): AreaId {
  const match = AREA_IDS.find((id) => id !== 'home' && pathname.startsWith(AREA_PATHS[id]));
  return match ?? 'home';
}
