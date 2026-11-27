// Settings › Advanced as the daemon answers it (US-SYS-27…31, 37, 38).
import { AdvancedSection } from '../settings/advanced-section';
import { fakeMe } from './me';
import { renderScreen, type Handlers } from './render';

export const UPDATES = {
  version: '0.7.0',
  channel: 'stable' as 'stable' | 'beta',
  autoHlabs: true,
  autoApps: false,
  backupBeforeUpdate: true,
  lastCheckedAt: null,
  available: null,
  blockedBy: null,
};

export const INFO = {
  version: '0.7.0',
  hostname: 'hlabs',
  os: { platform: 'darwin', release: '25.0.0', arch: 'arm64', headless: false },
  cpu: { model: 'Apple M1', cores: 8 },
  memoryBytes: 16e9,
  uptimeSeconds: 100,
  engine: { kind: 'orbstack', running: true, version: '27.0' },
};

export function renderAdvanced(over: Handlers = {}) {
  return renderScreen(() => <AdvancedSection shippedPhase={7} />, {
    'auth.me': fakeMe(),
    'settings.updates.get': () => UPDATES,
    'system.info': () => INFO,
    'jobs.list': () => ({ items: [] }),
    'apps.list': () => ({ apps: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
    'backups.destinations.list': () => ({ destinations: [{ id: 'nas', name: 'your NAS' }] }),
    'system.logs': () => ({ lines: [] }),
    'system.connections': () => ({ connections: [] }),
    'events.stream': () => new Promise(() => {}),
    ...over,
  });
}
