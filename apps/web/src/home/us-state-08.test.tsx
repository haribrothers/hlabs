// US-STATE-08 · Grey out Home when the engine has stopped.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { EngineWatch } from '../lib/engine-state';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import type { HomeApp } from './app-grid';
import { BANNER_DELAY_MS } from './engine-banner';
import { HomeView } from './home-view';

const app = (id: string, name: string): HomeApp => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});
const info = (running: boolean) => ({ engine: { kind: 'orbstack', running, version: running ? '27' : null } });

function home(running: boolean, role: 'admin' | 'member' = 'admin') {
  let publish!: (event: unknown) => void;
  const event = new Promise((r) => (publish = r));
  let engine = running;
  const rendered = renderScreen(
    () => (
      <>
        <HomeView />
        <EngineWatch />
      </>
    ),
    {
      'auth.me': fakeMe({ role }),
      'home.getLayout': () => ({ items: [], dock: [] }),
      'apps.list': () => ({ apps: [app('jellyfin', 'Jellyfin'), app('vault', 'Vaultwarden')] }),
      'system.info': () => info(engine),
      'events.stream': () => event,
    },
  );
  /** engine.status from the daemon; system.info says the same from then on. */
  const status = async (next: boolean) => {
    engine = next;
    await act(async () =>
      publish({
        id: '1',
        data: {
          type: 'engine.status',
          data: { running: next, kind: 'orbstack', managedByHlabs: false, socketPath: '/x.sock' },
        },
      }),
    );
  };
  return { ...rendered, status };
}

afterEach(() => vi.restoreAllMocks());

describe('US-STATE-08', () => {
  it('shows "The container engine has stopped" with the body, within 2 s', async () => {
    home(false);
    expect(BANNER_DELAY_MS).toBeLessThanOrEqual(2_000);
    const banner = await screen.findByRole('status', {}, { timeout: 2_500 });
    expect(banner).toHaveTextContent('The container engine has stopped');
    expect(banner).toHaveTextContent('All apps are offline. Your data is safe.');
  });

  it('Details opens Settings › Engine & startup', async () => {
    const { router } = home(false);
    fireEvent.click(await screen.findByRole('link', { name: 'Details' }, { timeout: 2_500 }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/engine'));
  });

  it('every tile is offline: greyed out, aria-disabled, described, not clickable, no menu', async () => {
    const opened = vi.spyOn(browser, 'open').mockImplementation(() => {});
    home(false);
    const tile = await screen.findByRole('button', { name: 'Jellyfin' }, { timeout: 2_500 });
    await waitFor(() => expect(tile).toHaveAttribute('aria-disabled', 'true'));
    expect(tile).toHaveClass('hl-app-offline');
    expect(tile).toHaveAccessibleDescription('Offline: the container engine has stopped');
    fireEvent.click(tile);
    fireEvent.contextMenu(tile);
    expect(opened).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('with the engine running there is no banner and tiles work', async () => {
    home(true);
    const tile = await screen.findByRole('button', { name: 'Open Jellyfin' });
    expect(tile).not.toHaveAttribute('aria-disabled');
    await new Promise((r) => setTimeout(r, BANNER_DELAY_MS + 100));
    expect(screen.queryByText('The container engine has stopped')).toBeNull();
  });

  it('the engine stopping while Home is open shows the banner from the event', async () => {
    const { status } = home(true);
    await screen.findByRole('button', { name: 'Open Jellyfin' });
    await status(false);
    expect(await screen.findByText('The container engine has stopped', {}, { timeout: 2_500 })).toBeInTheDocument();
  });

  it('members get Details too', async () => {
    home(false, 'member');
    expect(await screen.findByRole('link', { name: 'Details' }, { timeout: 2_500 })).toBeInTheDocument();
  });
});
