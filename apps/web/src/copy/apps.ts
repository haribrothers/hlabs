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

  // Logs (US-APP-08…10)
  logsTitle: (app: string) => `${app} logs`,
  backToSettings: 'Back to app settings',
} as const;
