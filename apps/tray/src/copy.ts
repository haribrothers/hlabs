// Tray menu copy. Actions follow the prototype order (TrayMenu guidelines).
export const trayCopy = {
  running: 'Running',
  /** US-INST-05: "Running · 11 apps". */
  runningApps: { none: 'Running · no apps', one: 'Running · 1 app', many: (n: number) => `Running · ${n} apps` },
  engineStopped: 'Container engine stopped',
  /** US-INST-17, US-INST-18: the "Reset a password" window (TrayResetPassword). */
  reset: {
    title: 'Reset a password',
    note: 'Only people who can log in to this Mac can do this.',
    account: 'Account',
    accountOption: (displayName: string, username: string, admin: boolean) =>
      `${displayName} (@${username}) · ${admin ? 'Admin' : 'Member'}`,
    newPassword: 'New password',
    tooShort: 'Use at least 12 characters',
    tooCommon: 'This password is too common',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    turnOffTwoFactor: 'Also turn off two-factor for this account',
    osConfirm: "Next, macOS asks for this Mac's login password to confirm it's you.",
    cancel: 'Cancel',
    submit: 'Reset password',
    loading: 'Loading accounts…',
    accountGone: 'This account no longer exists.',
    failed: "The password wasn't reset. Check that hlabs is running and try again.",
  },
  /** US-INST-14: the notification after 60 s offline. */
  offlineTitle: 'hlabs',
  offlineBody: 'Your apps are offline.',
  paused: 'Paused · apps stopped',
  /** US-INST-08: TrayStates "Paused". */
  pausedNote: 'Your apps are stopped to save battery and memory. Data is untouched.',
  resumeApps: 'Resume apps',
  /** US-INST-13, US-STATE-07. */
  restarting: 'Restarting…',
  updating: 'Updating hlabs…',
  restartHlabs: 'Restart hlabs',
  showLogs: 'Show logs',
  /** Why hlabs is down, from /healthz (US-STATE-05's reasons, worded for the computer running hlabs). */
  downReasons: {
    migration_failed: "hlabs couldn't update its database. Your data hasn't been changed.",
    storage_unavailable: "hlabs can't find its storage folder. Check that the drive is connected.",
  } as Record<string, string>,
  downNote: "The background service that runs your apps isn't answering.",
  /** US-INST-12. */
  engineNames: {
    orbstack: 'OrbStack',
    'docker-desktop': 'Docker Desktop',
    colima: 'Colima',
    'docker-engine': 'Docker Engine',
  } as Record<string, string>,
  engineOffline: (name: string | null) => `${name ?? 'The container engine'} isn't running, so your apps are offline.`,
  startEngine: 'Start engine',
  startingEngine: 'Starting engine…',
  engineDidntStart: "Engine didn't start",
  troubleshoot: 'Troubleshoot…',
  copyDiagnostics: 'Copy diagnostics',
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
  /** US-INST-07: the item while a backup runs, its secondary text, and when another task holds it off. */
  backingUp: (percent: number) => `Backing up… ${percent}%`,
  lastNever: 'Last: never',
  lastJustNow: 'Last: just now',
  lastAgo: (ago: string) => `Last: ${ago}`,
  lastBackupFailed: 'Last backup failed',
  busyTryLater: 'Busy, try later',
  /** US-INST-14: what VoiceOver reads with the red dot after a failed backup. */
  backupFailedLine: (line: string) => `${line} · last backup failed`,
  startAtLogin: 'Start at login',
  startAtLoginFailed: "Couldn't change login setting",
  pauseAll: 'Pause all apps',
  checkForUpdates: 'Check for updates…',
  /** US-INST-19: "Check for updates…" while checking, and for 3 s after. */
  checking: 'Checking…',
  upToDate: 'hlabs is up to date',
  checkFailed: "Couldn't check for updates",
  /** TrayStates "Update available". */
  versionReady: (version: string) => `Version ${version} is ready`,
  restartNote: 'Apps restart for about a minute during the update.',
  restartToUpdate: 'Restart to update',
  whatsNew: "What's new",
  /** US-INST-20: another task (a restore, moving data…) has to finish first. */
  finishTaskFirst: 'Finish the running task first',
  /** US-INST-20: the update was refused or didn't install; nothing changed. Shown in place of "Check for updates…". */
  installFailed: "The update couldn't be installed",
  resetPassword: 'Reset a password…',
  uninstall: 'Uninstall hlabs…',
  /** US-INST-21, US-INST-22 (TrayUninstall, D-143): the uninstall window, then its steps. */
  uninstallWindow: {
    title: 'Uninstall hlabs?',
    lead: (apps: number) =>
      apps === 0
        ? 'hlabs is removed from this Mac.'
        : apps === 1
          ? 'Your app stops and hlabs is removed from this Mac.'
          : `All ${apps} apps stop and hlabs is removed from this Mac.`,
    loading: 'Working out what hlabs keeps…',
    whatToKeep: 'What to keep',
    keep: 'Keep my data',
    keepNote: (root: string) => `App data and Home folders stay in ${root}, so you can reinstall later`,
    deleteAll: 'Delete everything',
    deleteNote: (size: string | null, root: string) =>
      size ? `Removes ${size}. This can't be undone.` : `Removes everything in ${root}. This can't be undone.`,
    removeColima: 'Also remove Colima, which hlabs installed',
    note: "Backups on your NAS aren't touched. Dragging hlabs to the Trash on its own would leave apps running in the background, so use this instead.",
    cancel: 'Cancel',
    submit: 'Uninstall',
    unreachable: "hlabs isn't answering, so it can't be uninstalled now. Restart hlabs from the menu, then try again.",
    progressTitle: 'Uninstalling hlabs',
    keepingSubtitle: (root: string) => `Your data stays in ${root}`,
    deletingSubtitle: 'Deleting everything',
    stoppingApps: 'Stopping apps',
    removingColima: 'Removing Colima',
    removingHlabs: 'Removing hlabs',
    deletingData: 'Deleting data',
    stepStates: { done: 'done', working: 'in progress', pending: 'not started', failed: "didn't finish" },
    busy: 'hlabs is busy with another task, like a backup or an update. Try again when it has finished.',
    appsFailed: "Some apps couldn't be stopped. Try again, or copy the diagnostics to ask for help.",
    colimaFailed: "Colima couldn't be removed. Try again, or copy the diagnostics to ask for help.",
    removeFailed: "hlabs couldn't remove its background service. Try again.",
    deleteFailed:
      "Some of hlabs's data couldn't be deleted. Disconnect any drive connected inside your hlabs folder, then try again.",
    quitFailed: "hlabs couldn't move itself to the Trash. Drag hlabs from Applications to the Trash.",
    tryAgain: 'Try again',
    copyDiagnostics: 'Copy diagnostics',
    copied: 'Copied',
  },
  quit: 'Quit hlabs',
  /** US-INST-10 (D-120): the warning before quitting stops hlabs and every app. */
  quitTitle: 'Quit hlabs?',
  quitBody:
    'Your apps will stop, and nobody can reach them or the dashboard, at home or away, until you open hlabs again. Your data stays as it is.',
  cancel: 'Cancel',
  ok: 'OK',
  quitBusyTitle: 'hlabs is busy',
  quitBusyBody: "An update or a restore is running and can't be interrupted. Quit hlabs when it's done.",
  stoppingApps: 'Stopping apps…',
  /** US-SYS-42: another program holds hlabs's web port. */
  portInUseStatus: (port: number) => `Can't use port ${port}`,
  portHeld: (port: number, byServe: boolean) =>
    `Port ${port} is in use by ${byServe ? 'Tailscale Serve' : 'another program'}, so other devices can't reach hlabs.`,
  useOtherPort: (port: number) => `Use port ${port}`,
  otherPortTaken: (port: number) => `Port ${port} is in use too. Choose another in Settings › Network.`,
  /** US-SYS-44 (TrayPublic): what's public on the internet, and turning it all off after the OS confirms it's you. */
  publicApps: (n: number) => `Public: ${n} ${n === 1 ? 'app' : 'apps'}`,
  turnOffPublic: 'Turn off public access…',
  asksForTouchId: 'Asks for Touch ID',
  asksForPassword: 'Asks for your password',
  turningOffPublic: 'Turning off public access…',
  publicOffFailed: "Couldn't turn off public access",
  publicOffTitle: 'Public access is off',
  publicOffBody: 'Your apps are private again. Cloudflare Tunnel stays set up.',
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
