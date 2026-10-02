// Home (04-home.md). Sentence case, plain words.
export const homeCopy = {
  title: 'hlabs — Home',
  widgets: 'Widgets',
  apps: 'Apps',
  openApp: (name: string) => `Open ${name}`,
  installApp: 'Install app',
  storage: 'Storage',
  leftOf: (total: string) => `left of ${total}`,
  appsUsage: 'Apps',
  system: 'System',
  couldntLoad: "Couldn't load",
  retry: 'Try again',
  /** What a tile says while its app is between states (US-HOME-06). */
  tileStatus: {
    starting: 'Starting…',
    restarting: 'Restarting…',
    stopping: 'Stopping…',
    rollingBack: 'Rolling back…',
    removing: 'Removing…',
  },
  /** A stopped or broken app's tile (US-HOME-08). */
  recover: {
    stopped: (app: string) => `${app} is stopped`,
    start: 'Start',
    starting: (app: string) => `Starting ${app}…`,
    askAdmin: (app: string, admin: string | null) =>
      `${app} isn't running right now. Ask ${admin ?? 'an admin'} to start it.`,
  },
  /** A tile's menu (US-HOME-07). */
  menu: {
    open: 'Open',
    settings: 'Settings',
    logs: 'View logs',
    restart: 'Restart',
    stop: 'Stop',
    start: 'Start',
    uninstall: 'Uninstall…',
    restarted: (app: string) => `${app} restarted`,
    started: (app: string) => `${app} started`,
    stopped: (app: string) => `${app} stopped`,
  },
  greeting: {
    morning: (name: string) => `Good morning, ${name}`,
    afternoon: (name: string) => `Good afternoon, ${name}`,
    evening: (name: string) => `Good evening, ${name}`,
  },
} as const;
