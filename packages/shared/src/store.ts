// How the App Store groups manifest categories (US-STORE-02): one sidebar entry per group, in this fixed order. Labels
// live in the dashboard's copy; the daemon counts apps per group.

export const STORE_CATEGORY_GROUPS = [
  { id: 'media', categories: ['media'] },
  { id: 'files', categories: ['photos', 'files'] },
  { id: 'network', categories: ['network'] },
  { id: 'home', categories: ['home'] },
  { id: 'developer', categories: ['developer'] },
  { id: 'ai', categories: ['ai'] },
  { id: 'productivity', categories: ['productivity'] },
  { id: 'security', categories: ['security'] },
  { id: 'finance', categories: ['finance'] },
  { id: 'books', categories: ['books'] },
  { id: 'monitoring', categories: ['monitoring'] },
  { id: 'other', categories: ['other'] },
] as const;

export type StoreCategoryGroup = (typeof STORE_CATEGORY_GROUPS)[number]['id'];

export const STORE_CATEGORY_GROUP_IDS = STORE_CATEGORY_GROUPS.map((g) => g.id) as [
  StoreCategoryGroup,
  ...StoreCategoryGroup[],
];

/** The group a manifest category belongs to (unknown categories count as "other"). */
export function categoryGroupOf(category: string): StoreCategoryGroup {
  return STORE_CATEGORY_GROUPS.find((g) => (g.categories as readonly string[]).includes(category))?.id ?? 'other';
}
