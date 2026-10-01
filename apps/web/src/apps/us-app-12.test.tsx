// US-APP-12 · Uninstall runs and cleans up.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { tileState } from '../home/app-grid';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppIcon } from '@hlabs/ui';
import { AppSettings } from './app-settings';
import { AppWindow, REMOVED_CLOSE_MS } from './app-window';

const never = () => new Promise(() => {});

describe('US-APP-12', () => {
  it('confirming closes the dialog and goes back to Home', async () => {
    const { calls, router } = renderScreen(
      () => <AppSettings appId="vaultwarden" />,
      {
        'apps.get': () => appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running' }),
        'apps.uninstall': () => ({ jobId: 'j1' }),
        'events.stream': never,
        'auth.me': fakeMe({ role: 'admin' }),
      },
      { path: '/apps/vaultwarden/settings' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Uninstall…' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Uninstall' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(calls).toContainEqual({ path: 'apps.uninstall', input: { appId: 'vaultwarden', keepData: true } });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('on Home, an app being uninstalled shows "Removing…"', () => {
    expect(tileState('uninstalling')).toBe('removing');
    render(<AppIcon name="Vaultwarden" state="removing" />);
    expect(screen.getByRole('button', { name: 'Vaultwarden, removing…' })).toHaveTextContent('Removing…');
  });

  it('someone with the app open sees "This app was removed." and the window closes to Home', async () => {
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    const { router } = renderScreen(
      () => <AppWindow appId="vaultwarden" />,
      {
        'apps.get': () => appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running', embed: true }),
        'events.stream': () => event,
        'auth.me': fakeMe({ role: 'member' }),
      },
      { path: '/apps/vaultwarden' },
    );
    await screen.findByTitle('Vaultwarden');
    await act(async () =>
      publish({
        id: '1',
        data: { type: 'app.stateChanged', data: { appId: 'vaultwarden', state: 'uninstalling', detail: 'removed' } },
      }),
    );
    expect(await screen.findByText('This app was removed.')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: REMOVED_CLOSE_MS + 2_000 });
  });
});
