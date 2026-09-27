// Words for the dashboard shell (Dock, tab bar, area windows). Sentence case, plain words.
import type { UiStrings } from '@hlabs/ui';

export const areaLabels = {
  home: 'Home',
  store: 'App Store',
  files: 'Files',
  usage: 'Usage',
  backups: 'Backups',
  settings: 'Settings',
} as const;

/** The phone tab bar says "Apps" for the App Store (US-PHONE-01). */
export const phoneAreaLabels = { ...areaLabels, store: 'Apps' } as const;

export const shellCopy = {
  skipToContent: 'Skip to content',
  mainLabel: 'Main content',
  homeHeading: 'Home',
  areaEmpty: 'Nothing here yet.',
} as const;

/** Copy for words @hlabs/ui components render themselves. */
export const uiStrings: Partial<UiStrings> = {
  dock: 'Dock',
  tabBar: 'Tab bar',
  search: 'Search',
  addToDock: 'Add to Dock',
  dismiss: 'Dismiss',
};
