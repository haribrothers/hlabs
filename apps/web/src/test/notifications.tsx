// Notifications for the bell's tests (US-HOME-13, 14): a few as the panel would list them, and the bell on a fake
// daemon. NOW is a fixed evening, so times read the same in every run.
import type { Notification } from '@hlabs/api';
import type { ComponentType } from 'react';
import { NotificationsBell } from '../home/notifications';
import { Toaster } from '../shell/toaster';
import { fakeMe } from './me';
import { renderScreen, type Handlers } from './render';

export const NOW = new Date(2026, 10, 22, 19, 0).getTime();
export const MIN = 60_000;

export function note(overrides: Partial<Notification> & { id: string }): Notification {
  return {
    kind: 'app.crashed',
    target: null,
    severity: 'critical',
    title: 'Uptime Kuma couldn’t start',
    body: 'Port 3001 is in use by another program.',
    actions: [],
    createdAt: NOW - 5 * MIN,
    readAt: null,
    ...overrides,
  };
}

export const SAMPLE: Notification[] = [
  note({ id: 'n1', actions: [{ kind: 'navigate', to: '/apps/uptime-kuma/logs' }] }),
  note({
    id: 'n2',
    kind: 'auth.locked',
    severity: 'warning',
    title: 'Repeated failed logins',
    body: '5 failed logins for @hari from 100.101.3.7. Logging in as @hari is paused for 15 minutes.',
    actions: [{ kind: 'navigate', to: '/settings/account' }],
    createdAt: NOW - 60 * MIN,
  }),
  note({
    id: 'n3',
    kind: 'store.updates',
    severity: 'info',
    title: '2 app updates available',
    body: 'Home Assistant and Immich.',
    actions: [{ kind: 'navigate', to: '/store/updates' }],
    createdAt: NOW - 3 * 60 * MIN,
  }),
  note({
    id: 'n4',
    kind: 'backup.succeeded',
    severity: 'success',
    title: 'Backup finished',
    body: '11 apps backed up to NAS.',
    createdAt: new Date(2026, 10, 21, 3, 12).getTime(),
    readAt: NOW - 600 * MIN,
  }),
];

export function bell(handlers: Handlers, opts: { routes?: Record<string, ComponentType> } = {}) {
  return renderScreen(
    () => (
      <>
        <NotificationsBell shippedPhase={7} />
        <Toaster />
      </>
    ),
    {
      'auth.me': fakeMe({ role: 'admin' }),
      'events.stream': () => new Promise(() => {}),
      ...handlers,
    },
    opts,
  );
}
