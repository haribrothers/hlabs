// US-HOME-06 · Recognise each app's state on its tile.
import { appStateSchema } from '@hlabs/api';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { AppGrid, TILE, type HomeApp } from './app-grid';
import { HomeView } from './home-view';

const app = (id: string, name: string, state: HomeApp['state']): HomeApp => ({
  id,
  name,
  state,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});

describe('US-HOME-06', () => {
  it('maps every app state to exactly one tile', () => {
    expect(Object.keys(TILE).sort()).toEqual([...appStateSchema.options].sort());
    expect(TILE).toMatchObject({
      running: { state: 'running' },
      installing: { state: 'installing' },
      starting: { state: 'busy', status: 'Starting…' },
      restarting: { state: 'busy', status: 'Restarting…' },
      stopping: { state: 'busy', status: 'Stopping…' },
      stopped: { state: 'stopped' },
      updating: { state: 'updating' },
      rolling_back: { state: 'busy', status: 'Rolling back…' },
      error: { state: 'error' },
      install_failed: { state: 'error' },
      uninstalling: { state: 'busy', status: 'Removing…' },
    });
  });

  it('each tile shows and says its state', async () => {
    renderScreen(
      () => (
        <AppGrid
          apps={[
            app('jellyfin', 'Jellyfin', 'running'),
            app('nextcloud', 'Nextcloud', 'installing'),
            app('pihole', 'Pi-hole', 'stopped'),
            app('kuma', 'Uptime Kuma', 'error'),
            app('immich', 'Immich', 'starting'),
            app('gitea', 'Gitea', 'updating'),
            app('vault', 'Vaultwarden', 'restarting'),
            app('n8n', 'n8n', 'uninstalling'),
          ]}
          isAdmin
          progress={new Map([['nextcloud', 64]])}
        />
      ),
      {},
    );
    // Running: the logo and name only.
    expect(await screen.findByRole('button', { name: 'Open Jellyfin' })).not.toHaveTextContent(/Stopped|Error|…/);
    expect(screen.getByRole('button', { name: 'Nextcloud, installing, 64%' })).toHaveTextContent('Installing… 64%');
    const pihole = screen.getByRole('button', { name: 'Pi-hole, stopped' });
    expect(pihole).toHaveClass('hl-app-stopped');
    expect(pihole).toHaveTextContent('Stopped');
    expect(screen.getByRole('button', { name: 'Uptime Kuma, error' })).toHaveTextContent('Error');
    expect(screen.getByRole('button', { name: 'Immich, starting' })).toHaveTextContent('Starting…');
    expect(screen.getByRole('button', { name: 'Gitea, updating' })).toHaveTextContent('Updating…');
    expect(screen.getByRole('button', { name: 'Vaultwarden, restarting' })).toHaveTextContent('Restarting…');
    expect(screen.getByRole('button', { name: 'n8n, removing' })).toHaveTextContent('Removing…');
  });

  it('a state change on the event stream updates the tile without a reload', async () => {
    let state: HomeApp['state'] = 'running';
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    renderScreen(() => <HomeView />, {
      'auth.me': fakeMe({ role: 'admin' }),
      'home.getLayout': () => ({ items: [], dock: [] }),
      'apps.list': () => ({ apps: [app('vault', 'Vaultwarden', state)] }),
      'events.stream': () => event,
    });
    await screen.findByRole('button', { name: 'Open Vaultwarden' });
    state = 'restarting';
    await act(async () =>
      publish({
        id: '1',
        data: { type: 'app.stateChanged', data: { appId: 'vault', state: 'restarting', detail: null } },
      }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Vaultwarden, restarting' })).toBeInTheDocument(), {
      timeout: 1000,
    });
  });
});
