// D-166 · App settings and Logs open over the page they're opened from: the page stays behind them, the address says
// which is open, Close and Back return to the page, and Logs' Back puts the settings in their place.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppOverlay, appOverlay, overlayForPath, useAppOverlay } from './app-overlay';

const vault = appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running' });

function Page() {
  const overlay = useAppOverlay();
  return (
    <>
      <h1>Files page</h1>
      <button type="button" onClick={() => overlay.openSettings('vaultwarden')}>
        Open settings
      </button>
      <button type="button" onClick={() => overlay.follow('/apps/vaultwarden/logs?service=server')}>
        Follow logs link
      </button>
      <AppOverlay />
    </>
  );
}

function open() {
  return renderScreen(
    Page,
    {
      'auth.me': fakeMe({ role: 'admin' }),
      'apps.get': () => ({ ...vault }),
      'apps.logs': () => ({ lines: [], services: ['server'] }),
      'events.stream': () => new Promise(() => {}),
    },
    { path: '/files' },
  );
}

describe('D-166 App settings and Logs over the page', () => {
  it('reads the dialog from the address, and an app page link as its dialog', () => {
    expect(appOverlay({ settings: 'vaultwarden', path: '/x' })).toEqual({ settings: 'vaultwarden' });
    expect(appOverlay({ logs: 'kuma', at: '1700', service: 'db', from: 'settings' })).toEqual({
      logs: 'kuma',
      at: 1700,
      service: 'db',
      from: 'settings',
    });
    expect(appOverlay({ settings: '../etc' })).toEqual({});
    expect(overlayForPath('/apps/kuma/settings')).toEqual({ settings: 'kuma' });
    expect(overlayForPath('/apps/kuma/logs?at=5')).toEqual({ logs: 'kuma', at: 5 });
    expect(overlayForPath('/apps/kuma')).toBeNull();
    expect(overlayForPath('/store/updates')).toBeNull();
  });

  it('opens App settings over the page, which stays; Close returns to it', async () => {
    const { router } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Open settings' }));
    await waitFor(() => expect(router.state.location.href).toBe('/files?settings=vaultwarden'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Vaultwarden' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'App settings' })).toBeInTheDocument();
    // The page is still there behind it.
    expect(screen.getByText('Files page')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(router.state.location.href).toBe('/files'));
    expect(screen.queryByRole('dialog', { name: 'App settings' })).toBeNull();
  });

  it("a link to an app's logs opens them over the page; their Back puts App settings in their place", async () => {
    const { router } = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Follow logs link' }));
    await waitFor(() => expect(router.state.location.href).toBe('/files?logs=vaultwarden&service=server'));
    const back = await screen.findByRole('button', { name: 'Back to app settings' });
    const depth = router.history.length;
    fireEvent.click(back);
    await waitFor(() => expect(router.state.location.href).toBe('/files?settings=vaultwarden'));
    // Replaced, not pushed: closing the settings never lands back on Logs (D-124).
    expect(router.history.length).toBe(depth);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(router.state.location.href).toBe('/files'));
  });

  it('an address with the dialog in it opens it straight away (a reload)', async () => {
    const { router } = open();
    await act(() => router.navigate({ to: '/files' as never, search: { settings: 'vaultwarden' } as never }));
    expect(await screen.findByRole('dialog', { name: 'App settings' })).toBeInTheDocument();
  });
});
