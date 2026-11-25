// Toast buttons (US-STATE-15): verb first. A navigate action from a notification gets its label from where it goes.
import type { ToastMutation } from '@hlabs/shared';

export const toastCopy = {
  viewLogs: 'View logs',
  viewDetails: 'View details',
  changePort: 'Change port',
  manageStorage: 'Manage storage',
  open: 'Open',
  /** The App Store's updates (US-HOME-14). */
  review: 'Review',
  /** Settings › Account, where sessions are: a lock or a used recovery code (US-HOME-14). */
  seeSessions: 'See sessions',
  /** A public app's Visits (US-APP-29). */
  seeVisits: 'See visits',
  /** A public app's settings (US-APP-27). */
  appSettings: 'App settings',
  /** An error's help page on the website (US-SITE-10), in a new tab. */
  learnMore: 'Learn more',
  newTab: '(opens in a new tab)',
  /** The success toast after a Retry (or other mutation) from a toast works (D-066). */
  done: {
    'apps.start': 'App started',
    'apps.restart': 'App restarted',
    'apps.uninstall': 'Uninstalling the app',
    'apps.reinstall': 'Reinstalling the app',
    'backups.runNow': 'Backup started',
    'settings.updates.check': 'Checked for updates',
    'apps.setPublic': 'Making the app private',
    'auth.revokeOtherSessions': 'Signed out everywhere else',
  } satisfies Record<ToastMutation, string>,
};
