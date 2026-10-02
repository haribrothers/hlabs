import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionWatch } from '../login/session-watch';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { HomeView } from './home-view';

const app = (id: string, name: string) => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null },
});

describe('US-ACCT-26', () => {
  it("a member's Home drops a tile as soon as access.changed arrives, without a reload", async () => {
    let shared = [app('jellyfin', 'Jellyfin'), app('immich', 'Immich')];
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    renderScreen(
      () => (
        <>
          <HomeView />
          <SessionWatch />
        </>
      ),
      {
        'auth.me': fakeMe({ role: 'member' }),
        'home.getLayout': () => ({ items: [], dock: [] }),
        'apps.list': () => ({ apps: shared }),
        'notifications.list': () => ({ items: [] }),
        'events.stream': () => event,
      },
    );
    expect(await screen.findByRole('button', { name: 'Open Immich' })).toBeInTheDocument();
    shared = [app('jellyfin', 'Jellyfin')];
    await act(async () => publish({ id: '1', data: { type: 'access.changed', data: { userId: 'u1' } } }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Immich' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Open Jellyfin' })).toBeInTheDocument();
  });
});
