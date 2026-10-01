// Using installed apps: the app window, app settings, logs and uninstall (06-apps.md). Sentence case, plain words.
import type { AppState } from '@hlabs/api';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const appsCopy = {
  /** The status label by app state (US-APP-02). */
  status: {
    running: 'Running',
    starting: 'Starting…',
    restarting: 'Restarting…',
    stopping: 'Stopping…',
    stopped: 'Stopped',
    updating: 'Updating…',
    rolling_back: 'Rolling back…',
    error: 'Not responding',
    uninstalling: 'Uninstalling…',
    installing: 'Installing…',
    install_failed: 'Install failed',
  } satisfies Record<AppState, string>,
  docTitle: (app: string) => `${app} · hlabs`,

  // App window (US-APP-01…03)
  window: 'App window',
  backToHome: 'Back to Home',
  closeApp: 'Close app',
  openInNewTab: 'Open in a new tab',
  frameTitle: (app: string) => `${app}`,
  loading: (app: string) => `Loading ${app}`,
  slow: 'This app is taking a while to respond.',
  opensInTab: (app: string) => `${app} opens in its own tab.`,
  restartApp: 'Restart app',
  logs: 'Logs',
  appSettings: 'App settings',
  isStopped: (app: string) => `${app} is stopped.`,
  start: 'Start',
  askToStart: 'Ask an admin to start it.',
  notResponding: (app: string) => `${app} isn't responding.`,
  askToRestart: 'Ask an admin to restart it.',

  // App settings (US-APP-04…07)
  settingsTitle: (app: string) => `${app} settings`,
  close: 'Close',
  /** "up 3 minutes", "up 5 hours", "up 6 days": how long its web container has run. */
  upFor: (ms: number) => {
    const [n, unit] =
      ms >= DAY
        ? [Math.floor(ms / DAY), 'day']
        : ms >= HOUR
          ? [Math.floor(ms / HOUR), 'hour']
          : [Math.max(1, Math.floor(ms / MINUTE)), 'minute'];
    return `up ${n} ${unit}${n === 1 ? '' : 's'}`;
  },
  sections: 'App sections',
  tabs: { overview: 'Overview', configuration: 'Configuration', permissions: 'Permissions', usage: 'Usage' },
  open: 'Open',
  restart: 'Restart',
  stop: 'Stop',
  didntStart: (app: string) => `${app} didn't start. Check the logs.`,
  engineFirst: 'Start the container engine first',
  // Access (US-APP-05)
  access: 'Access',
  copy: 'Copy',
  copyAddress: (url: string) => `Copy ${url}`,
  addressCopied: 'Address copied',
  copyFailed: "Couldn't copy the address. Select it and copy it yourself.",
  alsoOnTailnet: 'Also on your tailnet',
  // Behaviour (US-APP-06)
  behaviour: 'Behaviour',
  startAutomatically: 'Start automatically',
  includeInBackups: 'Include in backups',
  updateAutomatically: 'Update automatically',
  customNeverUpdates: 'Custom apps never update automatically',
  // Storage and resources, version (US-APP-07)
  storage: 'Storage and resources',
  dataFolder: 'Data folder',
  usingNow: 'Using now',
  disk: (size: string) => `Disk ${size}`,
  stoppedDisk: (size: string) => `Stopped · Disk ${size}`,
  countingDisk: 'Counting disk use…',
  upToDate: (version: string) => `Version ${version} · up to date`,
  updateAvailable: (version: string, next: string) => `Version ${version} · ${next} available`,
  // Updating, and an update that rolled back (US-APP-07, US-STORE-17)
  update: 'Update',
  updating: (percent: number) => `Updating… ${percent}%`,
  rolledBackTitle: (app: string) => `${app}'s update didn't start, so hlabs rolled it back`,
  rolledBackBody: (version: string) => `It's running ${version} again.`,
  restoreFailedTitle: (app: string) => `${app} couldn't be restored`,
  restoreFailedBody: (from: string, to: string) =>
    `Its update to ${to} didn't start, and ${from} didn't start again either. Check its logs.`,
  viewLog: 'View log',
  dismiss: 'Dismiss',
  // Uninstall (US-APP-11, US-APP-12)
  uninstallEllipsis: 'Uninstall…',
  uninstallTitle: (app: string) => `Uninstall ${app}?`,
  uninstallBody: 'The app stops and is removed from your Home screen.',
  dataQuestion: 'What happens to its data',
  keepData: 'Keep its data',
  keepDataNote: 'Reinstalling later picks up where you left off.',
  deleteData: 'Delete its data too',
  deleteDataNote: (size: string | null) =>
    size ? `Removes ${size}. This can't be undone.` : "Removes everything it saved. This can't be undone.",
  uninstall: 'Uninstall',
  uninstallAndDelete: 'Uninstall and delete data',
  needsIt: (other: string, app: string) => `${other} needs ${app}. Uninstall it first.`,
  cancel: 'Cancel',
  appRemoved: 'This app was removed.',

  // Logs (US-APP-08…10)
  logsTitle: (app: string) => `${app} logs`,
  backToSettings: 'Back to app settings',
  backToApp: (app: string) => `Back to ${app}`,
  following: 'Following',
  noLogs: 'No logs yet.',
  containerRestarted: 'Container restarted',
  logsFailed: "Couldn't load the logs. Check that the container engine is running, then try again.",
  // Filters (US-APP-09)
  filterLogs: 'Filter logs',
  filter: 'Filter',
  container: 'Container',
  allContainers: 'All',
  errorsOnly: 'Errors only',
  noMatches: 'No lines match these filters.',
  clearFilters: 'Clear filters',
  // Download (US-APP-10)
  download: 'Download',
  downloadIgnoresFilters: 'Downloads every line, not only the ones the filters show',
  downloadFailed: "Couldn't download logs.",
  tryAgain: 'Try again',
} as const;
