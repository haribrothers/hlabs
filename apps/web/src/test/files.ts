// Files as the daemon answers it, for the Files component tests (07-files).
import { fakeMe } from './me';

const GB = 1e9;

export const folder = (path: string, over: Record<string, unknown> = {}) => ({
  path,
  crumbs: [{ path: '/home', name: null }],
  place: { area: 'home', name: 'Hari', readOnly: false },
  items: [],
  nextCursor: null,
  count: 0,
  filesBytes: 0,
  ...over,
});

export function filesHandlers(over: Record<string, (input: unknown) => unknown> = {}) {
  return {
    'auth.me': fakeMe(),
    'storage.locations.list': () => ({
      locations: [
        { id: 'root', kind: 'local', name: 'This computer', path: '/x', isRoot: true, status: 'ok' },
        { id: 'nas', kind: 'smb', name: 'NAS · Media', path: '/m', isRoot: false, status: 'unreachable', usedBy: [] },
        { id: 'usb', kind: 'external', name: 'Backup disk', path: '/v', isRoot: false, status: 'ok' },
      ],
    }),
    'storage.summary': () => ({
      totalBytes: 256 * GB,
      freeBytes: 142 * GB,
      appsBytes: 0,
      filesBytes: 0,
      systemBytes: 0,
      hlabsBytes: 0,
      backupCacheBytes: 0,
      reclaimableImageBytes: 0,
    }),
    'files.list': (input: unknown) => folder((input as { path: string }).path),
    'files.recent': () => ({ items: [] }),
    'files.openWith': () => ({ apps: [] }),
    'files.uploads': () => ({ uploads: [] }),
    // The event stream stays open and quiet.
    'events.stream': () => new Promise(() => {}),
    ...over,
  };
}
