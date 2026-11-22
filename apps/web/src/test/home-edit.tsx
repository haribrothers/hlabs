// Home at phase 7 for the edit-mode stories (US-HOME-16…20): inside <main id="main"> as the shell draws it, with three
// apps, the four admin widgets and a fake daemon that remembers what was saved.
import type { ComponentType } from 'react';
import type { HomeApp } from '../home/home-app';
import { HomeView } from '../home/home-view';
import { Toaster } from '../shell/toaster';
import { fakeMe } from './me';
import { renderScreen, type Handlers } from './render';

export const tile = (id: string, name: string, state: HomeApp['state'] = 'running'): HomeApp => ({
  id,
  name,
  state,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});

export const APPS = [tile('jellyfin', 'Jellyfin'), tile('immich', 'Immich'), tile('vault', 'Vaultwarden')];

export type Item = { kind: 'app' | 'widget'; id: string };

export function homeAt7(
  handlers: Handlers = {},
  opts: { widgets?: string[]; hidden?: string[]; routes?: Record<string, ComponentType> } = {},
) {
  const saved: Array<{ items: Item[]; hidden?: string[] }> = [];
  const layout = {
    items: [
      ...(opts.widgets ?? ['storage']).map((id) => ({ kind: 'widget' as const, id })),
      ...APPS.map((a) => ({ kind: 'app' as const, id: a.id })),
    ],
    dock: [] as string[],
    hidden: opts.hidden ?? [],
  };
  const r = renderScreen(
    () => (
      <>
        <main id="main">
          <HomeView shippedPhase={7} />
        </main>
        <Toaster />
      </>
    ),
    {
      'auth.me': fakeMe({ role: 'admin' }),
      'home.getLayout': () => layout,
      'apps.list': () => ({ apps: APPS }),
      'events.stream': () => new Promise(() => {}),
      'storage.summary': () => ({ freeBytes: 1e11, totalBytes: 2e11, appsBytes: 1e10, systemBytes: 3e10 }),
      'home.getWidgetData': () => ({}),
      'home.listWidgets': () => ({
        system: [
          { id: 'live-usage', name: 'Live usage' },
          { id: 'storage', name: 'Storage' },
          { id: 'app-status', name: 'App status' },
          { id: 'updates', name: 'Updates' },
        ],
        apps: [],
      }),
      'notifications.unreadCount': () => ({ count: 0 }),
      'home.saveLayout': (input) => {
        const i = input as { items: Item[]; hidden?: string[] };
        saved.push(i);
        return { items: i.items, hidden: i.hidden ?? [] };
      },
      ...handlers,
    },
    { routes: opts.routes },
  );
  return { ...r, saved };
}
