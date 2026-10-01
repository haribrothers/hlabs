// Phase 2 feedback (D-097): on the real dashboard (HTTPS) the app window checks the app's address first; one this
// browser doesn't trust says so with Open in a new tab, Trust hlabs on this device and Try again.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { addressReachable } from './address-check';
import { AppWindow } from './app-window';

vi.mock('./address-check', () => ({ shouldCheckAddress: () => true, addressReachable: vi.fn() }));
const reachable = vi.mocked(addressReachable);

function open() {
  return renderScreen(
    () => <AppWindow appId="jellyfin" />,
    {
      'apps.get': () =>
        appDetail({
          id: 'jellyfin',
          name: 'Jellyfin',
          state: 'running',
          embed: true,
          urls: { local: 'https://jellyfin.hlabs.local', tailnet: null },
        }),
      'events.stream': () => new Promise(() => {}),
      'auth.me': fakeMe({ role: 'admin' }),
    },
    { path: '/apps/jellyfin' },
  );
}

beforeEach(() => reachable.mockReset());

describe('App window address check (D-097)', () => {
  it('a trusted address loads the frame', async () => {
    reachable.mockResolvedValue(true);
    open();
    expect(await screen.findByTitle('Jellyfin')).toHaveAttribute('src', 'https://jellyfin.hlabs.local');
    expect(reachable).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
  });

  it("an address the browser doesn't trust says so, with a new tab, the trust guide and Try again", async () => {
    reachable.mockResolvedValue(false);
    const openTab = vi.spyOn(browser, 'open').mockImplementation(() => {});
    const { router } = open();
    const message = await screen.findByText("Your browser doesn't trust Jellyfin's address yet");
    const panel = message.parentElement!;
    expect(screen.queryByTitle('Jellyfin')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Open in a new tab' }));
    expect(openTab).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
    // Trusted since (in the other tab): Try again loads it.
    reachable.mockResolvedValue(true);
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTitle('Jellyfin')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/apps/jellyfin');
  });

  it('Trust hlabs on this device goes to the guide', async () => {
    reachable.mockResolvedValue(false);
    const { router } = open();
    fireEvent.click(await screen.findByRole('link', { name: 'Trust hlabs on this device' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/trust'));
  });
});
