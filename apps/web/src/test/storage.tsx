// Settings › Storage as the daemon answers it (US-SYS-11…14): the design's numbers.
import { StorageSection } from '../settings/storage-section';
import { fakeMe } from './me';
import { renderScreen, type Handlers } from './render';

const GB = 1e9;

export const SUMMARY = {
  totalBytes: 256 * GB,
  freeBytes: 142 * GB,
  appsBytes: 77 * GB,
  filesBytes: 20 * GB,
  systemBytes: 17 * GB,
  hlabsBytes: 7 * GB,
  backupCacheBytes: 10 * GB,
  reclaimableImageBytes: 6.2 * GB,
  diskKind: 'internalSsd' as 'internalSsd' | 'internalDisk' | 'external' | null,
  trashBytes: 1.2 * GB,
  trashCount: 3,
};

export const LOCATIONS = {
  appDataPath: '~/hlabs/app-data',
  locations: [
    {
      id: 'root',
      kind: 'local',
      name: 'This computer',
      path: '/Users/hari/hlabs',
      displayPath: '~/hlabs',
      address: null,
      isRoot: true,
      status: 'ok',
      autoMount: true,
      appsAllowed: true,
      usedBy: [],
      readOnly: false,
    },
    {
      id: 'nas',
      kind: 'smb',
      name: 'NAS · Media',
      path: '/Volumes/Media',
      displayPath: '/Volumes/Media',
      address: 'smb://nas.local/Media',
      isRoot: false,
      status: 'ok',
      autoMount: true,
      appsAllowed: true,
      usedBy: ['Jellyfin'],
      readOnly: false,
    },
    {
      id: 'usb',
      kind: 'external',
      name: 'Travel disk',
      path: '/Volumes/Travel',
      displayPath: '/Volumes/Travel',
      address: null,
      isRoot: false,
      status: 'unreachable',
      autoMount: true,
      appsAllowed: true,
      usedBy: [],
      readOnly: false,
    },
  ],
};

export function renderStorage(over: Handlers = {}) {
  return renderScreen(() => <StorageSection />, {
    'auth.me': fakeMe(),
    'storage.summary': () => SUMMARY,
    'storage.locations.list': () => LOCATIONS,
    'storage.locations.discover': () => ({ servers: [] }),
    'apps.list': () => ({ apps: [] }),
    'events.stream': () => new Promise(() => {}),
    ...over,
  });
}
