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
    reinstalling: 'Reinstalling…',
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
  // An address this browser doesn't trust (D-097)
  untrustedTitle: (app: string) => `Your browser doesn't trust ${app}'s address yet`,
  untrustedBody:
    'hlabs uses its own certificate on your home network. Open the app in a new tab and accept it there, or trust hlabs on this device once so every app opens here.',
  trustDevice: 'Trust hlabs on this device',
  opensInTab: (app: string) => `${app} opens in its own tab.`,
  restartApp: 'Restart app',
  logs: 'Logs',
  appSettings: 'App settings',
  isStopped: (app: string) => `${app} is stopped.`,
  start: 'Start',
  askToStart: 'Ask an admin to start it.',
  notResponding: (app: string) => `${app} isn't responding.`,
  stoppedWorking: (app: string) => `${app} stopped working`,
  /** The settings header of an app that stopped working (US-APP-24): "Stopped working · it quit unexpectedly". */
  stoppedWorkingStatus: (reason: string) =>
    `Stopped working · ${reason.charAt(0).toLowerCase()}${reason.slice(1).replace(/\.$/, '')}`,
  // Reinstall (US-APP-24, US-APP-25)
  fixHint: "Restart it, or reinstall it if that doesn't help. Its data is kept either way.",
  reinstallEllipsis: 'Reinstall…',
  /** The action tile in the phone's App settings sheet (US-PHONE-08). */
  reinstallShort: 'Reinstall',
  reinstall: 'Reinstall',
  reinstallTitle: (app: string) => `Reinstall ${app}?`,
  reinstallBody: (app: string, version: string, size: string | null) =>
    `hlabs downloads ${app} ${version} again${size ? ` (about ${size})` : ''} and sets it up from scratch.`,
  keptTitle: 'Kept as they are',
  kept: [
    'Its data and settings',
    'Passwords it created',
    'Folder access and who it’s shared with',
    'Its place on Home and in the Dock',
  ],
  startsWhenDone: 'It starts when it’s done.',
  reinstallBlocked: (app: string) =>
    `hlabs can't find ${app}'s saved settings, so reinstalling would reset its passwords. To start over, uninstall it and install it again.`,
  resumeFirst: 'Resume apps first',
  waitFor: (job: string) => `Wait for ${job} to finish`,
  reinstalling: (app: string) => `Reinstalling ${app}`,
  beingReinstalled: (app: string) => `${app} is being reinstalled`,
  reinstallStep: {
    stopping: 'Stopping',
    removing: 'Removing old containers',
    pulling: (app: string, version: string) => `Downloading ${app} ${version}`,
    starting: 'Starting',
    health: 'Checking it works',
  },
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
  // Require hlabs login (US-APP-19)
  requireLogin: 'Require hlabs login',
  requireLoginHint: 'Adds your hlabs sign-in in front of the app',
  ownLoginToo: 'Uses its own login too',
  loginOffTitle: (app: string) => `Turn off hlabs login for ${app}?`,
  loginOffBody: (address: string, app: string) =>
    `Anyone who can reach ${address} will see ${app}'s own sign-in page. Members without access to it in hlabs will no longer be blocked.`,
  turnOff: 'Turn off',
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
  versionOnly: (version: string) => `Version ${version}`,
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
