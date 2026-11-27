// App Store copy (05-app-store.md, US-STORE-01…07).
import type { StoreCategoryGroup } from '@hlabs/shared';

export const storeCopy = {
  title: 'App Store',
  docTitle: 'App Store · hlabs',
  backHome: 'Back to Home',
  discover: 'Discover',
  categories: 'Categories',
  manageApps: 'Manage apps',
  updates: 'Updates',
  updatesCount: (n: number) => `${n} ${n === 1 ? 'update' : 'updates'}`,
  appSources: 'App sources',
  deployCustom: 'Deploy your own app',
  featured: 'Featured',
  allApps: 'All apps',
  seeAll: 'See all',
  seeAllOf: (row: string) => `See all ${row}`,
  install: 'Install',
  open: 'Open',
  installed: 'Installed',
  installing: (percent: number) => `Installing… ${percent}%`,
  installFailed: 'See what went wrong',
  installApp: (name: string) => `Install ${name}`,
  openApp: (name: string) => `Open ${name}`,
  detailsOf: (name: string) => `${name} details`,
  /** The phone's featured card (US-PHONE-10). */
  view: 'View',
  viewApp: (name: string) => `View ${name}`,
  appCount: (n: number) => `${n} ${n === 1 ? 'app' : 'apps'}`,
  empty: 'No apps here yet.',
  searchLabel: 'Search apps',
  clearSearch: 'Clear search',
  searchPlaceholder: (n: number) => `Search ${n} ${n === 1 ? 'app' : 'apps'}`,
  resultsFor: (q: string) => `Results for “${q}”`,
  noResults: (q: string) => `No apps match “${q}”`,
  filterAll: (n: number) => `All · ${n}`,
  filterInstalled: (n: number) => `Installed · ${n}`,
  filterArm64: { macos: 'Apple Silicon only', linux: 'ARM64 only' },
  filters: 'Filter results',
  cantFind: 'Can’t find an app?',
  addSource: 'Add another app source',
  // Browse a category (US-STORE-04)
  sortLabel: 'Sort apps',
  sorts: { popular: 'Popular', new: 'New', name: 'A–Z' },
  compatibleFirst: { macos: 'showing Apple Silicon compatible first', linux: 'showing ARM64 compatible first' },
  /** Under a category's title on a phone (PhoneRedesignA_StoreCategory). */
  compatibleFirstShort: { macos: 'Apple Silicon compatible first', linux: 'ARM64 compatible first' },
  loadingMore: 'Loading more apps…',
  // App details (US-STORE-06)
  officialSource: 'hlabs official',
  about: 'About',
  whatsNew: "What's new",
  more: 'More',
  less: 'Less',
  screenshots: 'Screenshots',
  /** PhoneAppDetails' facts (PhoneRedesignA_Details). */
  information: 'Information',
  /** PhoneAppDetails' info strip (PhoneRedesignA_Details). */
  atAGlance: 'At a glance',
  latest: 'Latest',
  installedVersion: (v: string) => `Installed ${v}`,
  memory: 'Memory',
  disk: 'Disk',
  category: 'Category',
  atLeast: 'at least',
  toStart: 'to start',
  gbFigure: (n: string) => `${n} GB`,
  noFigure: '—',
  categoryShort: {
    media: 'Media',
    photos: 'Photos',
    files: 'Files',
    network: 'Network',
    home: 'Home',
    developer: 'Developer',
    ai: 'AI',
    productivity: 'Productivity',
    security: 'Security',
    finance: 'Finance',
    books: 'Books',
    monitoring: 'Monitoring',
    other: 'Other',
  } as Record<string, string>,
  screenshotN: (n: number, of: number) => `Screenshot ${n} of ${of}`,
  openScreenshot: (n: number) => `Open screenshot ${n}`,
  /** A screenshot's alt text on a phone (US-PHONE-11). */
  screenshot: (n: number) => `Screenshot ${n}`,
  previous: 'Previous',
  next: 'Next',
  close: 'Close',
  facts: 'About this app',
  version: 'Version',
  runsAs: 'Runs as',
  containers: (n: number, roles: string[]) =>
    `${n} ${n === 1 ? 'container' : 'containers'}${roles.length ? ` · ${roles.join(', ')}` : ''}`,
  roles: { server: 'server', database: 'database', cache: 'cache' },
  opensAt: 'Opens at',
  needsAccess: 'Needs access to',
  // Requirements and access (US-STORE-07)
  memoryWarning: (need: string, free: string) => `Recommends ${need} GB of memory. hlabs has ${free} GB free.`,
  diskWarning: (need: string, free: string) => `Needs ${need} GB of free space. You have ${free} GB.`,
  access: 'What it can access',
  network: { none: 'No network', lan: 'Your home network only', internet: 'Internet' },
  networkLabel: 'Network',
  folderMode: { rw: 'Read and write', ro: 'Read only' },
  port: (label: string, port: number) => `${label} on port ${port}`,
  portNote: 'Opens a port on this computer to your network.',
  gpu: 'Graphics card (GPU)',
  gpuNote: 'Uses your graphics card to run faster.',
  docker: 'Control of your other apps (Docker)',
  dockerNote: 'Can start, stop and change every app on hlabs.',
  deviceNote: (path: string) => `Device ${path} · Used only when it's plugged in`,
  capability: (cap: string) => (cap === 'NET_ADMIN' ? 'Network settings' : cap),
  capabilityNote: (cap: string) =>
    cap === 'NET_ADMIN' ? "Can change this computer's network settings, as a VPN needs" : `Linux capability ${cap}`,
  risky: 'Risky',
  needsFirst: (name: string) => `Needs ${name} installed first`,
  noArm64: {
    macos: "There's no Apple Silicon version of this app yet.",
    linux: "There's no ARM64 version of this app yet.",
  },
  /** AppDetailsOverlap: what hlabs already does that the app also does (US-STORE-23). */
  overlaps: {
    remoteAccess:
      'hlabs already gives you remote access with Tailscale. Use this only if you need it for something else.',
    backups: 'hlabs already backs up your apps and files.',
    appManagement: 'hlabs already manages your apps; this one can control all of them.',
  },
  /** After noArm64 in the AppDetailsX86 banner (US-STORE-23). */
  runsOnIntel: 'It runs on computers with an Intel or AMD chip.',
  runsOn: 'Runs on',
  intelAndAmd: 'Intel and AMD (x86-64)',
  /** The "platform" tag: an arm64 image on an arm64 computer. */
  arm64Tag: { macos: 'Apple Silicon', linux: 'ARM64' },
  /** In place of the platform tag on an arm64 computer, for an app without an arm64 image (US-STORE-23). */
  x86Only: 'x86 only',
  /** Under About, for an app drafted from another store's definition (US-STORE-23, D-148). */
  packagedWith: (store: string, license: string) => `Packaged with help from the ${store} app store (${license})`,
} as const;

/** Store groups (US-STORE-02), in the order the daemon returns them. */
export const categoryLabels: Record<StoreCategoryGroup, string> = {
  media: 'Media',
  files: 'Files & photos',
  network: 'Networking',
  home: 'Home automation',
  developer: 'Developer',
  ai: 'Local AI',
  productivity: 'Productivity',
  security: 'Security',
  finance: 'Finance',
  books: 'Books',
  monitoring: 'Monitoring',
  other: 'Other',
};

/** Manifest tags the store shows as tags; others aren't shown. */
export const tagLabels: Record<string, string> = {
  'local-ai': 'Local AI',
};
