// Phase 2 feedback (D-096): App settings and Logs open as dialogs over the app window, which stays open behind them
// (its frame isn't reloaded); Close and Back return to where they were opened from; a dialog that fails says so in a
// dialog, not a page.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppWindow } from './app-window';

const never = () => new Promise(() => {});
const jellyfin = appDetail({
  id: 'jellyfin',
  name: 'Jellyfin',
  state: 'running',
  embed: true,
  urls: { local: 'https://jellyfin.hlabs.local', tailnet: null, port: null },
});

function open(handlers: Handlers = {}) {
  return renderScreen(
    () => <AppWindow appId="jellyfin" />,
    {
      'apps.get': () => jellyfin,
      'apps.logs': () => ({ lines: [] }),
      'apps.watchLogs': never,
      'events.stream': never,
      'auth.me': fakeMe({ role: 'admin' }),
      ...handlers,
    },
    { path: '/apps/jellyfin' },
  );
}

afterEach(() => vi.restoreAllMocks());

describe('App window dialogs (D-096)', () => {
  it('App settings opens over the window, which stays with its frame; Close goes back to the window', async () => {
    const { router } = open();
    const frame = await screen.findByTitle('Jellyfin');
    fireEvent.click(screen.getByRole('button', { name: 'App settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'App settings' });
    // The same frame, never reloaded.
    expect(screen.getByTitle('Jellyfin', { exact: true })).toBe(frame);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.search).toEqual({});
    expect(screen.getByTitle('Jellyfin')).toBe(frame);
  });

  it('Logs from the window goes Back to the app; from App settings, back to App settings', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Logs' }));
    const logs = await screen.findByRole('dialog', { name: 'Jellyfin logs' });
    fireEvent.click(within(logs).getByRole('button', { name: 'Back to Jellyfin' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'App settings' }));
    const settings = await screen.findByRole('dialog', { name: 'App settings' });
    fireEvent.click(within(settings).getByRole('button', { name: 'Logs' }));
    const fromSettings = await screen.findByRole('dialog', { name: 'Jellyfin logs' });
    fireEvent.click(within(fromSettings).getByRole('button', { name: 'Back to app settings' }));
    expect(await screen.findByRole('dialog', { name: 'App settings' })).toBeInTheDocument();
  });

  it('Escape closes the dialog, not the window', async () => {
    const { router } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'App settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'App settings' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/apps/jellyfin');
    expect(screen.getByRole('region', { name: 'App window' })).toBeInTheDocument();
  });
});
