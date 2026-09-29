// A store app as the daemon lists it, for component tests.
import type { StoreApp } from '@hlabs/api';

export const storeApp = (id: string, name: string, extra: Partial<StoreApp> = {}): StoreApp => ({
  id,
  sourceId: 'builtin',
  name,
  tagline: `${name} tagline`,
  category: 'media',
  group: 'media',
  icon: { logoUrl: null, gradient: null, fallback: null },
  tags: [],
  arm64: true,
  installed: false,
  ...extra,
});
