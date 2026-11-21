// Backups as the daemon answers them, for the Backups component tests (08-usage-backups).
import { fakeMe } from './me';

const HOUR = 3_600_000;

/** Up to two hours ago, but always today, so tests that read "today" pass just after midnight too. */
export const earlierToday = () => Math.max(new Date().setHours(0, 0, 0, 0), Date.now() - 2 * HOUR);

export const destination = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  kind: 'smb',
  name: 'NAS',
  location: 'nas.local/Backups',
  status: 'ok',
  usedBytes: 38e9,
  restorePoints: 42,
  offsite: false,
  hasKeys: false,
  busy: false,
  latestAt: earlierToday(),
  ...over,
});

export const run = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  destinationId: 'd1',
  destinationName: 'NAS',
  startedAt: Date.now() - 2 * HOUR,
  finishedAt: Date.now() - 2 * HOUR + 6 * 60_000,
  status: 'succeeded',
  trigger: 'schedule',
  bytesAdded: 1.2e9,
  filesChanged: 120,
  error: null,
  appCount: 11,
  folderCount: 3,
  retry: false,
  ...over,
});

export const overview = (over: Record<string, unknown> = {}) => ({
  lastRun: run(),
  lastSuccessAt: Date.now() - 2.5 * HOUR,
  /** The next 03:00. */
  nextRunAt: (() => {
    const d = new Date();
    if (d.getHours() >= 3) d.setDate(d.getDate() + 1);
    d.setHours(3, 0, 0, 0);
    return d.getTime();
  })(),
  scheduleEnabled: true,
  overdue: false,
  included: { apps: 11, folders: 3, notBackedUp: 0 },
  destinations: [destination()],
  plan: { scheduleCron: '0 3 * * *', retention: { daily: 7, weekly: 4, monthly: 6 } },
  running: null,
  restoring: null,
  blockedBy: null,
  chart: [
    { id: 'r0', startedAt: Date.now() - 26 * HOUR, status: 'succeeded', bytesAdded: 0.8e9 },
    { id: 'r1', startedAt: Date.now() - 2 * HOUR, status: 'succeeded', bytesAdded: 1.2e9 },
  ],
  ...over,
});

export const plan = (over: Record<string, unknown> = {}) => ({
  scheduleCron: '0 3 * * *',
  retention: { daily: 7, weekly: 4, monthly: 6 },
  include: { apps: ['immich', 'jellyfin'], folders: ['users/hari', 'users/anu', 'shared'], includeNewApps: true },
  enabled: true,
  pauseApps: true,
  nextRunAt: null,
  apps: [
    { kind: 'app', id: 'immich', label: 'Immich', sizeBytes: 24e9, excluded: null },
    { kind: 'app', id: 'jellyfin', label: 'Jellyfin', sizeBytes: 480e6, excluded: 'library excluded' },
  ],
  folders: [
    { kind: 'folder', id: 'users/anu', label: 'Home › Anu', sizeBytes: 2.4e9 },
    { kind: 'folder', id: 'users/hari', label: 'Home › Hari', sizeBytes: 5.1e9 },
    { kind: 'folder', id: 'shared', label: 'Shared', sizeBytes: 8.7e9 },
  ],
  ...over,
});

export function backupsHandlers(over: Record<string, (input: unknown) => unknown> = {}) {
  return {
    'auth.me': fakeMe(),
    'backups.overview': () => overview(),
    'backups.plan.get': () => plan(),
    'backups.plan.estimate': () => ({ fullCopyBytes: 45e9, items: [] }),
    'backups.listRuns': () => ({ runs: [run()], nextCursor: null }),
    'storage.locations.list': () => ({ locations: [] }),
    'storage.listDrives': () => ({ drives: [] }),
    'events.stream': () => new Promise(() => {}),
    ...over,
  };
}
