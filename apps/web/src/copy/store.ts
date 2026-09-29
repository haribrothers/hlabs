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
  installApp: (name: string) => `Install ${name}`,
  openApp: (name: string) => `Open ${name}`,
  detailsOf: (name: string) => `${name} details`,
  appCount: (n: number) => `${n} ${n === 1 ? 'app' : 'apps'}`,
  empty: 'No apps here yet.',
  searchLabel: 'Search apps',
  searchPlaceholder: (n: number) => `Search ${n} ${n === 1 ? 'app' : 'apps'}`,
  resultsFor: (q: string) => `Results for “${q}”`,
  noResults: (q: string) => `No apps match “${q}”`,
  // App details (US-STORE-06)
  officialSource: 'hlabs official',
  about: 'About',
  whatsNew: "What's new",
  more: 'More',
  less: 'Less',
  screenshots: 'Screenshots',
  screenshotN: (n: number, of: number) => `Screenshot ${n} of ${of}`,
  openScreenshot: (n: number) => `Open screenshot ${n}`,
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
  noArm64: {
    macos: "There's no Apple Silicon version of this app yet.",
    linux: "There's no ARM64 version of this app yet.",
  },
  /** The "platform" tag: an arm64 image on an arm64 computer. */
  arm64Tag: { macos: 'Apple Silicon', linux: 'ARM64' },
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
