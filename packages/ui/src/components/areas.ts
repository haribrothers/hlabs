/** The six top-level areas, in their fixed order (D-054). */
export const AREA_IDS = ['home', 'store', 'files', 'usage', 'backups', 'settings'] as const;
export type AreaId = (typeof AREA_IDS)[number];

/** A count badge's text: "9+" above nine (US-HOME-05). Screen readers get the real count. */
export const badgeText = (n: number) => (n > 9 ? '9+' : String(n));

export interface AreaItem {
  id: AreaId | (string & {});
  label: string;
  /** Glyph key; defaults to id. */
  icon?: AreaId | 'search';
  /** Red count badge. */
  badge?: number;
}
