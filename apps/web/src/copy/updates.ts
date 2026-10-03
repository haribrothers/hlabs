// Settings › Updates (docs/features/10-system-settings.md US-SYS-23…26, SettingsUpdates). Sentence case, plain words.
export const updatesCopy = {
  hlabs: 'hlabs',
  upToDate: 'hlabs is up to date',
  available: (version: string) => `hlabs ${version} is available`,
  versionLine: (version: string) => `Version ${version}`,
  youHave: (version: string) => `You have ${version}. Apps restart for about a minute.`,
  lastChecked: (when: string) => `Last checked ${when}`,
  neverChecked: 'Not checked yet',
  checkNow: 'Check now',
  checking: 'Checking…',
  fullNotes: 'Full release notes',
};
