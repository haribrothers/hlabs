// Using installed apps: the app window, app settings, logs and uninstall (06-apps.md). Sentence case, plain words.
import type { AppState } from '@hlabs/api';

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
} as const;
