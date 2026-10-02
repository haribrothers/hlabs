// Phase 2 feedback (D-096): a dialog over the app window that fails to render says so in a dialog over the window,
// with Close back to the window, instead of replacing the page with "Something went wrong".
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppWindow } from './app-window';

vi.mock('./app-settings', () => ({
  AppSettings: () => {
    throw new Error('settings broke');
  },
}));

describe('App window dialogs (D-096)', () => {
  it('a dialog that fails says so in a dialog over the window; Close goes back to the window', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { router } = renderScreen(
      () => <AppWindow appId="jellyfin" />,
      {
        'apps.get': () => appDetail({ id: 'jellyfin', name: 'Jellyfin', state: 'running', embed: true }),
        'events.stream': () => new Promise(() => {}),
        'auth.me': fakeMe({ role: 'admin' }),
      },
      { path: '/apps/jellyfin' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'App settings' }));
    const alert = await screen.findByRole('dialog', { name: 'Something went wrong' });
    // The window stays behind the dialog (hidden from screen readers while the dialog is open).
    expect(screen.getByRole('region', { name: 'App window', hidden: true })).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.getByRole('region', { name: 'App window' })).toBeInTheDocument();
  });
});
