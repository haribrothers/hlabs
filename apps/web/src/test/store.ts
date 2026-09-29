// A store app as the daemon lists it, for component tests.
import type { StoreApp, StoreAppDetails } from '@hlabs/api';

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

/** An app's details page data (US-STORE-06/07). */
export function details(extra: Partial<StoreAppDetails> = {}): StoreAppDetails {
  return {
    host: { os: 'macos', arm64: true },
    app: storeApp('immich', 'Immich', {
      tagline: 'Photo and video backup from your phone',
      group: 'files',
      category: 'photos',
    }),
    source: { id: 'builtin', name: 'hlabs', official: true },
    version: '3.2.2',
    description: 'Back up photos and videos\nfrom every phone.\n\nShare albums with family.',
    readme: null,
    releaseNotes: null,
    screenshots: [],
    services: [
      { name: 'immich-server', role: 'server' },
      { name: 'database', role: 'database' },
      { name: 'redis', role: 'cache' },
    ],
    address: 'immich.hlabs.local',
    folders: [{ key: 'library', label: 'Your Photos folder', description: null, mode: 'rw', required: true }],
    requirements: { memoryBytes: null, diskBytes: null, memoryFreeBytes: null, diskFreeBytes: null },
    access: { network: 'internet', ports: [], gpu: false, dockerSocket: false },
    dependsOn: [],
    ...extra,
  };
}
