// The App Store's Updates as the daemon lists them, and the page with fakes (US-STORE-15, US-STORE-16).
import type { StoreUpdates } from '@hlabs/api';
import { act } from '@testing-library/react';
import { StoreUpdatesView } from '../store/updates-view';
import { fakeMe } from './me';
import { renderScreen } from './render';

export const DAY = 86_400_000;
export const icon = { logoUrl: null, gradient: null, fallback: null };
export const pending = (appId: string, name: string, extra: Partial<StoreUpdates['pending'][number]> = {}) => ({
  appId,
  name,
  icon,
  state: 'running' as const,
  fromVersion: '1.0',
  toVersion: '1.1',
  releaseNotes: `- ${name} is faster`,
  releasedAt: Date.now() - 2 * DAY - 60_000,
  newAccess: null,
  ...extra,
});

export function updatesData(extra: Partial<StoreUpdates> = {}): StoreUpdates {
  return {
    pending: [pending('home-assistant', 'Home Assistant'), pending('immich', 'Immich')],
    rolledBack: [],
    recent: [],
    lastCheckedAt: Date.now() - 5 * 60_000 - 30_000,
    ...extra,
  };
}

/** One event, delivered to everything listening. */
export function oneEvent() {
  let publish!: (event: unknown) => void;
  const event = new Promise((r) => (publish = r));
  return {
    handler: () => event,
    send: (type: string, data: unknown) => act(async () => publish({ id: '1', data: { type, data } })),
  };
}

export function updatesPage(handlers: Record<string, (input: unknown) => unknown> = {}) {
  return renderScreen(
    () => <StoreUpdatesView shippedPhase={7} />,
    {
      'store.listUpdates': () => updatesData(),
      'jobs.list': () => ({ items: [] }),
      'events.stream': () => new Promise(() => {}),
      'auth.me': fakeMe(),
      ...handlers,
    },
    { path: '/store/updates', routes: { '/settings/$section': () => <h1>Settings section</h1> } },
  );
}
