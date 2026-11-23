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

/** The phone tab bar names the areas as the Dock does: "App Store" (US-PHONE-01, D-172). */
export const phoneAreaLabels = areaLabels;

export const shellCopy = {
  /** The connection banner (US-STATE-19). */
  offline: "You're offline",
  reconnecting: 'Reconnecting…',
  offlineToast: "You're offline. Try again when you're connected.",
  skipToContent: 'Skip to content',
  mainLabel: 'Main content',
  areaEmpty: 'Nothing here yet.',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
} as const;

/** Copy for words @hlabs/ui components render themselves. */
export const uiStrings: Partial<UiStrings> = {
  dock: 'Dock',
  tabBar: 'Tab bar',
  search: 'Search',
  addToDock: 'Add to Dock',
  dismiss: 'Dismiss',
  close: 'Close',
  cancel: 'Cancel',
  more: (name: string) => `More for ${name}`,
  back: 'Back',
};
