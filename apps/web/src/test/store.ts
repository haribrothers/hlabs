// A store app as the daemon lists it, for component tests.
import type { AppDetail, Job, StoreApp, StoreAppDetails } from '@hlabs/api';

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
      { name: 'immich-server', role: 'server', product: null },
      { name: 'database', role: 'database', product: 'PostgreSQL' },
      { name: 'redis', role: 'cache', product: 'Redis' },
    ],
    address: 'immich.hlabs.local',
    folders: [
      { key: 'library', label: 'Your Photos folder', description: null, mode: 'rw', required: true, default: null },
    ],
    requirements: { memoryBytes: null, diskBytes: null, memoryFreeBytes: null, diskFreeBytes: null },
    access: { network: 'internet', ports: [], gpu: false, dockerSocket: false },
    dependsOn: [],
    install: {
      webAuth: 'hlabs',
      ownLogin: false,
      takenHostnames: ['hlabs', 'www'],
      env: [],
      risky: false,
      allowed: true,
    },
    ...extra,
  };
}

type Folder = StoreAppDetails['folders'][number];

/** A manifest folder with a default place in Home (US-STORE-08). */
export const folder = (extra: Partial<Folder> = {}): Folder => ({
  key: 'library',
  label: 'Photo library',
  description: 'Where your library is stored.',
  mode: 'rw',
  required: true,
  default: {
    storageLocationId: 'root',
    subpath: 'users/hari/Photos',
    place: { area: 'home', locationName: null, path: 'Photos' },
    available: true,
  },
  ...extra,
});

/** An installed app as apps.get returns it (US-STORE-12…14). */
export const appDetail = (extra: Partial<AppDetail> = {}): AppDetail => ({
  id: 'immich',
  name: 'Immich',
  state: 'installing',
  stateDetail: null,
  address: 'immich.hlabs.local',
  webPort: 12000,
  installJobId: 'j1',
  nextFreePort: null,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  webPath: '/',
  urls: { local: 'https://immich.hlabs.local', tailnet: null },
  engineRunning: true,
  ...extra,
});

/** Its install job, with the step in `message` as the daemon writes it. */
export const installJob = (extra: Partial<Job> & { step?: string; detail?: Record<string, unknown> } = {}): Job => {
  const { step = 'pull', detail = {}, ...rest } = extra;
  return {
    id: 'j1',
    kind: 'app_install',
    target: 'immich',
    state: 'running',
    progress: 42,
    message: JSON.stringify({ step, detail }),
    hlabsCode: null,
    createdAt: 1,
    finishedAt: null,
    ...rest,
  };
};
