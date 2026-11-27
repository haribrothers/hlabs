// US-PHONE-09 · Search from Home on phone: "Search" opens Spotlight over the whole screen with the field focused;
// results group as on the desktop in rows at least 52 px tall; Cancel or Back closes it and Home is where it was.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HomeView } from '../home/home-view';
import { fakeMe } from '../test/me';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { closeSearch } from './search-state';
import { Spotlight } from './spotlight';

const jellyfin = {
  id: 'jellyfin',
  name: 'Jellyfin',
  state: 'running' as const,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: 'https://jellyfin.hlabs.local', tailnet: null, port: null },
};

function render() {
  return renderScreen(
    () => (
      <>
        <HomeView shippedPhase={9} />
        <Spotlight />
      </>
    ),
    {
      'auth.me': fakeMe(),
      'home.getLayout': () => ({ items: [], hidden: [], dock: [] }),
      'apps.list': () => ({ apps: [jellyfin] }),
      'notifications.unreadCount': () => ({ count: 0 }),
      'home.searchEverything': () => ({
        installed: [jellyfin],
        actions: [],
        store: [],
        storeTotal: 0,
        files: null,
        settings: [],
      }),
      'events.stream': () => new Promise(() => {}),
    },
  );
}

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  act(() => closeSearch());
  restore();
});

describe('US-PHONE-09', () => {
  it('"Search" opens Spotlight with the field focused, and Cancel instead of the keys', async () => {
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
    const panel = await screen.findByRole('dialog', { name: 'Search' });
    expect(panel).toHaveClass('hl-command');
    await waitFor(() => expect(within(panel).getByRole('combobox', { name: 'Search' })).toHaveFocus());
    expect(within(panel).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(panel).queryByText('esc')).toBeNull();
  });

  it('results group as on the desktop, each row at least 52 px tall', async () => {
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
    const panel = await screen.findByRole('dialog', { name: 'Search' });
    const row = await within(panel).findByRole('option', { name: /Jellyfin/ });
    expect(within(panel).getByText('Installed')).toBeInTheDocument();
    expect(row).toHaveClass('min-h-13');
  });

  it('Cancel closes it and steps back over its history entry; Back closes it too', async () => {
    const { router } = render();
    fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
    await screen.findByRole('dialog', { name: 'Search' });
    await waitFor(() => expect(router.state.location.state.layer).toBe('search'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull());
    expect(router.state.location.state.layer).toBeUndefined();
    expect(router.state.location.pathname).toBe('/');

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('dialog', { name: 'Search' });
    await waitFor(() => expect(router.state.location.state.layer).toBe('search'));
    act(() => router.history.back());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull());
  });
});
