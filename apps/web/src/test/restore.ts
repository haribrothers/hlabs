// A restore as backups.getRestore answers it, for the restore flow tests (US-BKP-17…22).
export const restoreView = (over: Record<string, unknown> = {}) => ({
  id: 'rs1',
  jobId: 'j1',
  status: 'running',
  cancellable: true,
  mode: 'replace',
  items: [{ kind: 'app', id: 'vaultwarden', label: 'Vaultwarden' }],
  pointTime: Date.now() - 86_400_000,
  destinationName: 'NAS',
  wholeSystem: false,
  steps: [
    {
      kind: 'stop',
      appId: 'vaultwarden',
      state: 'done',
      startedAt: 1000,
      finishedAt: 4000,
      bytesDone: null,
      bytesTotal: null,
    },
    {
      kind: 'safety',
      appId: null,
      state: 'done',
      startedAt: 4000,
      finishedAt: 16000,
      bytesDone: null,
      bytesTotal: null,
    },
    {
      kind: 'copy',
      appId: null,
      state: 'running',
      startedAt: 16000,
      finishedAt: null,
      bytesDone: 134e6,
      bytesTotal: 210e6,
    },
    {
      kind: 'start',
      appId: 'vaultwarden',
      state: 'todo',
      startedAt: null,
      finishedAt: null,
      bytesDone: null,
      bytesTotal: null,
    },
  ],
  error: null,
  copyFolder: null,
  ...over,
});

export const points = () => ({
  points: [
    { id: 'p3', time: Date.now() - 2 * 3_600_000, kind: 'daily', bytesChanged: 1.2e9 },
    { id: 'p2', time: Date.now() - 26 * 3_600_000, kind: 'daily', bytesChanged: 0.8e9 },
    { id: 'p1', time: new Date(2026, 8, 20, 3).getTime(), kind: 'weekly', bytesChanged: null },
  ],
});

export const snapshotItems = () => ({
  point: points().points[0],
  items: [
    { kind: 'app', id: 'vaultwarden', label: 'Vaultwarden', sizeBytes: 210e6, installed: true },
    { kind: 'app', id: 'immich', label: 'Immich', sizeBytes: 24e9, installed: false },
    { kind: 'folder', id: 'users/hari', label: 'Home › Hari', sizeBytes: 5.1e9, installed: true },
  ],
});
