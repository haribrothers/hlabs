// Tray menu copy. Actions follow the prototype order (TrayMenu guidelines).
export const trayCopy = {
  running: 'Running',
  cpu: 'CPU',
  memory: 'Memory',
  free: 'Free',
  openDashboard: 'Open Dashboard',
  copyAddress: 'Copy address',
  backUpNow: 'Back up now',
  quit: 'Quit hlabs',
  /** US-INST-16: the keychain refused access to the tray token. */
  keychainStatus: 'Needs Keychain access',
  keychainNote: 'hlabs needs Keychain access to work.',
  tryAgain: 'Try again',
  /** US-INST-13 / US-INST-16: the daemon can't be reached, or still refuses the tray after a repair. */
  unreachableStatus: "Can't reach hlabs",
} as const;
