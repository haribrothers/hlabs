// Toast buttons (US-STATE-15): verb first. A navigate action from a notification gets its label from where it goes.
import type { ToastMutation } from '@hlabs/shared';

export const toastCopy = {
  viewLogs: 'View logs',
  manageStorage: 'Manage storage',
  open: 'Open',
  /** The success toast after a Retry (or other mutation) from a toast works (D-066). */
  done: {
    'apps.start': 'App started',
    'apps.restart': 'App restarted',
    'apps.uninstall': 'Uninstalling the app',
    'backups.runNow': 'Backup started',
    'settings.updates.check': 'Checked for updates',
  } satisfies Record<ToastMutation, string>,
};
