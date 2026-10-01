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
  hints: { move: 'to move', open: 'to open', close: 'to close' },
  closeKeys: (mac: boolean) => (mac ? ['⌘', 'K'] : ['Ctrl', 'K']),
} as const;
