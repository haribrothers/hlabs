// Search (04-home.md US-HOME-09, US-HOME-10). Sentence case, plain words.
export const searchCopy = {
  label: 'Search',
  placeholder: 'Search',
  pill: 'Search apps, files, settings',
  shortcut: (mac: boolean) => (mac ? '⌘K' : 'Ctrl K'),
  esc: 'esc',
  results: 'Search results',
  groups: {
    installed: 'Installed',
    actions: 'Actions',
    store: 'App Store',
    files: 'Files',
    settings: 'Settings',
  },
  open: 'Open',
  action: {
    settings: (app: string) => `${app} settings`,
    restart: (app: string) => `Restart ${app}`,
    logs: (app: string) => `View ${app} logs`,
  },
  restarting: (app: string) => `Restarting ${app}…`,
  install: 'Install',
  seeAllStore: 'See all App Store results',
  noResults: (query: string) => `No results for “${query}”`,
  unavailable: "Search isn't available right now",
  hints: { move: 'to move', open: 'to open', close: 'to close' },
  closeKeys: (mac: boolean) => (mac ? ['⌘', 'K'] : ['Ctrl', 'K']),
} as const;
