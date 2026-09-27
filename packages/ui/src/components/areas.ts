/** The six top-level areas, in their fixed order (D-054). */
export const AREA_IDS = ['home', 'store', 'files', 'usage', 'backups', 'settings'] as const;
export type AreaId = (typeof AREA_IDS)[number];

export interface AreaItem {
  id: AreaId | (string & {});
  label: string;
  /** Glyph key; defaults to id. */
  icon?: AreaId | 'search';
  /** Red count badge. */
  badge?: number;
}
