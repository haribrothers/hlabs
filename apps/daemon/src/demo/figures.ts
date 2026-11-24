// The docs screenshots' demo data set (US-SITE-11, D-177): the people and apps of the design canvas, and the usage
// figures a pretend Mac mini gives. Every figure is a function of the time only, so the live samples, the history the
// seed writes and the charts drawn from them look the same on every run. Development only (HLABS_DEV_DEMO).

/** The people on the demo server: the design canvas's admin, and two family members (made-up names). */
export const DEMO_PEOPLE = [
  { username: 'hari', displayName: 'Hari', role: 'admin' },
  { username: 'maya', displayName: 'Maya', role: 'member' },
  { username: 'leo', displayName: 'Leo', role: 'member' },
] as const;

export interface DemoApp {
  /** The built-in store's app id: its listing gives the name and logo. */
  id: string;
  /** CPU (0–100 of the host) and memory it typically uses, and its network traffic (bytes/s). */
  cpu: number;
  memBytes: number;
  netRx: number;
  netTx: number;
  /** Its image on disk, and its data. */
  imageBytes: number;
  /** Installed at an older version than the store's, so the App Store has an update for it. */
  update?: string;
  /** Members it's shared with. */
  sharedWith: readonly string[];
}

const GB = 1e9;
const MB = 1e6;

/** The design canvas's apps (Main, AppStore, SettingsUsers…), as the built-in store has them. */
export const DEMO_APPS: readonly DemoApp[] = [
  {
    id: 'jellyfin',
    cpu: 6.4,
    memBytes: 1.4 * GB,
    netRx: 0.4 * MB,
    netTx: 2.6 * MB,
    imageBytes: 1.2 * GB,
    sharedWith: ['maya', 'leo'],
  },
  {
    id: 'immich',
    cpu: 4.1,
    memBytes: 2.3 * GB,
    netRx: 0.9 * MB,
    netTx: 0.3 * MB,
    imageBytes: 2.1 * GB,
    update: '3.2.1',
    sharedWith: ['maya'],
  },
  {
    id: 'vaultwarden',
    cpu: 0.2,
    memBytes: 0.06 * GB,
    netRx: 0.01 * MB,
    netTx: 0.02 * MB,
    imageBytes: 0.2 * GB,
    sharedWith: ['maya', 'leo'],
  },
  {
    id: 'nextcloud',
    cpu: 1.9,
    memBytes: 0.8 * GB,
    netRx: 0.3 * MB,
    netTx: 0.2 * MB,
    imageBytes: 1.4 * GB,
    update: '35.0.0',
    sharedWith: ['maya'],
  },
  {
    id: 'home-assistant',
    cpu: 2.3,
    memBytes: 0.7 * GB,
    netRx: 0.05 * MB,
    netTx: 0.04 * MB,
    imageBytes: 1.8 * GB,
    sharedWith: [],
  },
  {
    id: 'paperless-ngx',
    cpu: 1.2,
    memBytes: 0.9 * GB,
    netRx: 0.02 * MB,
    netTx: 0.01 * MB,
    imageBytes: 1.3 * GB,
    sharedWith: [],
  },
];

export const demoApp = (id: string) => DEMO_APPS.find((a) => a.id === id) ?? null;

/** The pretend Mac mini (M4, 10 cores, 32 GB) and its 1 TB disk. */
export const DEMO_MACHINE = {
  cpuModel: 'Apple M4',
  cpus: 10,
  memoryBytes: 32 * 2 ** 30,
  os: { platform: 'darwin', name: 'macOS', version: '15' },
  diskTotalBytes: 1e12,
  diskFreeBytes: 612e9,
  /** What macOS and everything else on it use, besides apps. */
  systemMemBytes: 6.8 * GB,
  systemCpu: 5.5,
  engine: { version: '28.3.2', cpus: 6, memoryBytes: 12 * 2 ** 30 },
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A slow wave, -1…1, unique to `seed`. */
function wave(ts: number, periodMs: number, seed: number): number {
  return Math.sin((2 * Math.PI * ts) / periodMs + seed * 1.7);
}

/** Busier in the evening (media), quiet at night: 0.55…1.45 over a UTC day. */
function daily(ts: number): number {
  const hour = (ts % DAY) / HOUR;
  return 1 + 0.45 * Math.sin((2 * Math.PI * (hour - 13)) / 24);
}

/** 0…1 for `id`, so each scope moves differently. */
function seedOf(id: string): number {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h / 997;
}

/** A load factor around 1 for `scope` at `ts`. */
function load(scope: string, ts: number): number {
  const s = seedOf(scope);
  return daily(ts) * (1 + 0.3 * wave(ts, 23 * MINUTE, s) + 0.12 * wave(ts, 6 * MINUTE, s * 3));
}

export interface DemoValues {
  cpu: number;
  memBytes: number;
  netRx: number;
  netTx: number;
  diskRead: number;
  diskWrite: number;
}

/** What an app uses at `ts`. */
export function appValuesAt(app: DemoApp, ts: number): DemoValues {
  const f = load(app.id, ts);
  return {
    cpu: app.cpu * f,
    memBytes: app.memBytes * (1 + 0.04 * wave(ts, 41 * MINUTE, seedOf(app.id))),
    netRx: app.netRx * f,
    netTx: app.netTx * f,
    diskRead: app.netTx * 0.4 * f,
    diskWrite: app.netRx * 0.6 * f,
  };
}

/** What the whole computer uses at `ts`: its apps and the rest. */
export function hostValuesAt(ts: number): DemoValues {
  const apps = DEMO_APPS.map((a) => appValuesAt(a, ts));
  const sum = (k: keyof DemoValues) => apps.reduce((total, v) => total + v[k], 0);
  const rest = load('host', ts);
  return {
    cpu: Math.min(100, DEMO_MACHINE.systemCpu * rest + sum('cpu')),
    memBytes: DEMO_MACHINE.systemMemBytes + sum('memBytes'),
    netRx: 0.2 * MB * rest + sum('netRx'),
    netTx: 0.1 * MB * rest + sum('netTx'),
    diskRead: 1.5 * MB * rest + sum('diskRead'),
    diskWrite: 0.8 * MB * rest + sum('diskWrite'),
  };
}

/** Totals that grow at a scope's rates, as network and disk counters do: two readings give the rate between them. */
export class DemoCounters {
  private readonly totals = new Map<string, { at: number; values: Omit<DemoValues, 'cpu' | 'memBytes'> }>();

  read(scope: string, ts: number, rates: DemoValues): Omit<DemoValues, 'cpu' | 'memBytes'> {
    const before = this.totals.get(scope);
    const seconds = before ? Math.max(0, ts - before.at) / 1000 : 0;
    const add = (k: 'netRx' | 'netTx' | 'diskRead' | 'diskWrite') =>
      Math.round((before?.values[k] ?? 1e9) + rates[k] * seconds);
    const values = { netRx: add('netRx'), netTx: add('netTx'), diskRead: add('diskRead'), diskWrite: add('diskWrite') };
    this.totals.set(scope, { at: ts, values });
    return values;
  }
}
