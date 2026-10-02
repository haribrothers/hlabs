// Tray menu copy. Actions follow the prototype order (TrayMenu guidelines).
export const trayCopy = {
  running: 'Running',
  /** US-INST-05: "Running · 11 apps". */
  runningApps: { none: 'Running · no apps', one: 'Running · 1 app', many: (n: number) => `Running · ${n} apps` },
  engineStopped: 'Container engine stopped',
  /** US-INST-11. */
  starting: 'Starting…',
  startingApps: (running: number, expected: number) => `Starting · ${running} of ${expected} apps`,
  runningWithAttention: (running: number, expected: number, attention: number) =>
    `Running · ${running} of ${expected} apps · ${attention} ${attention === 1 ? 'needs' : 'need'} attention`,
  showStartupLog: 'Show startup log',
  cpuSpoken: (v: string) => (v === '–' ? 'CPU usage not known yet' : `CPU usage ${v.replace('%', ' percent')}`),
  memorySpoken: (v: string) => (v === '–' ? 'Memory in use not known yet' : `Memory in use ${v}`),
  freeSpoken: (v: string) => (v === '–' ? 'Free space not known yet' : `Free space ${v}`),
  cpu: 'CPU',
  memory: 'Memory',
  free: 'Free',
  openDashboard: 'Open Dashboard',
  copyAddress: 'Copy dashboard address',
  copied: 'Copied',
  backUpNow: 'Back up now',
  startAtLogin: 'Start at login',
  pauseAll: 'Pause all apps',
  checkForUpdates: 'Check for updates…',
  resetPassword: 'Reset a password…',
  uninstall: 'Uninstall hlabs…',
  quit: 'Quit hlabs',
  /** US-INST-16: the keychain refused access to the tray token. */
  keychainStatus: 'Needs Keychain access',
  keychainNote: 'hlabs needs Keychain access to work.',
  tryAgain: 'Try again',
  /** US-INST-13 / US-INST-16: the daemon can't be reached, or still refuses the tray after a repair. */
  unreachableStatus: "Can't reach hlabs",
  /** US-INST-01: the first-launch window (TrayStates "First launch"). */
  setupTitle: 'Setting up hlabs',
  setupSubtitle: 'This happens once',
  stepService: 'Starting background service',
  stepBrowser: 'Opening setup in your browser…',
  stepStates: { done: 'done', working: 'in progress', pending: 'not started' },
  /** US-INST-02. */
  openSetup: 'Open setup',
} as const;
