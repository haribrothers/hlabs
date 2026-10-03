import { jobNames } from './errors';

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
  updateNow: 'Update now',
  starting: 'Starting update…',
  /** "Update now" waits for another job (D-020). */
  waitFor: (job: string) => `Wait for ${job} to finish`,
  automatic: 'Automatic updates',
  autoHlabs: 'Update hlabs automatically',
  autoHlabsNote: 'Installs overnight between 3 and 5 am',
  autoApps: 'Update apps automatically',
  autoAppsNote: "Only apps you've allowed in their settings",
  backupFirst: 'Back up app data before updating',
  backupFirstNote: 'Each app is backed up to your backup destination first',
  saveFailed: "Couldn't save that. Try again.",
  jobName: (kind: string) => jobNames[kind] ?? 'what hlabs is doing',
};
