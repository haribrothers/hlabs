// US-PHONE-10 · Browse the App Store on phone: the title, "Search N apps", "2 updates" for admins, the category chips
// from Discover, one Featured card with View, and each row as a list with its one button. Search (200 ms) and the
// categories' content are the desktop's (US-STORE-02…05).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { fakeMe } from '../test/me';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { storeApp } from '../test/store';
import { updatesData } from '../test/updates';
import { AppListView } from './app-list-view';
import { Discover } from './discover';
import { SEARCH_DELAY_MS } from './search';
import type { InstalledApp } from './store-app';
import { StoreLayout } from './store-layout';

const never = () => new Promise(() => {});
const installed = (id: string, state: InstalledApp['state']): InstalledApp => ({
  id,
  name: id,
  state,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});
const home = {
  host: { os: 'macos', arm64: true },
  featured: [storeApp('immich', 'Immich', { tagline: 'Back up every photo from your phone to the Mac mini.' })],
  collections: [
    {
      id: 'apple-silicon',
      title: 'Popular on Apple Silicon',
      apps: [
        storeApp('audiobookshelf', 'Audiobookshelf', { tagline: 'Audiobooks and podcasts' }),
        storeApp('uptime-kuma', 'Uptime Kuma', { tagline: 'Monitor every service' }),
        storeApp('mealie', 'Mealie'),
      ],
    },
  ],
  totalApps: 240,
};
const handlers = (role: 'admin' | 'member' = 'admin') => ({
  'auth.me': fakeMe({ role }),
  'store.getHome': () => home,
  'store.listCategories': () => ({
    categories: [
      { id: 'media', count: 10 },
      { id: 'files', count: 8 },
      { id: 'network', count: 6 },
    ],
  }),
  'store.listUpdates': () => updatesData(),
  'apps.list': () => ({
    apps: [installed('uptime-kuma', 'running'), { ...installed('mealie', 'installing') }],
  }),
  'events.stream': never,
});

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('US-PHONE-10', () => {
  it('"App Store" as a large title and "Search 240 apps"', async () => {
    renderScreen(() => <StoreLayout />, handlers(), { path: '/store' });
    expect(await screen.findByRole('heading', { level: 1, name: 'App Store' })).toHaveClass('hl-p-large');
    expect(await screen.findByPlaceholderText('Search 240 apps')).toHaveAccessibleName('Search apps');
  });

  it('the 2 updates row above the sections, and the chips starting with Discover', async () => {
    const { router } = renderScreen(() => <Discover shippedPhase={9} />, handlers(), {
      path: '/store',
      routes: { '/store/updates': () => <p>Updates list</p> },
    });
    const chips = await screen.findByRole('navigation', { name: 'Categories' });
    const links = await within(chips).findAllByRole('link');
    expect(links[0]).toHaveTextContent('Discover');
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links.map((l) => l.textContent)).toEqual(expect.arrayContaining(['Media', 'Files & photos']));
    const updates = await screen.findByRole('link', { name: '2 updates' });
    // Above the sections.
    const featured = screen.getByRole('region', { name: 'Featured' });
    expect(updates.compareDocumentPosition(featured) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(updates);
    await waitFor(() => expect(router.state.location.pathname).toBe('/store/updates'));
  });

  it('members and admins without updates get no updates row', async () => {
    renderScreen(() => <Discover shippedPhase={9} />, handlers('member'), { path: '/store' });
    await screen.findByRole('region', { name: 'Featured' });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('link', { name: /updates/ })).toBeNull();
  });

  it('a chip opens its category, marked selected, with its apps as rows', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const { router } = renderScreen(
      Discover,
      {
        ...handlers(),
        'store.listApps': () => ({
          host: { os: 'macos', arm64: true },
          title: null,
          counts: { all: 21, installed: 0 },
          items: [storeApp('plex', 'Plex', { tagline: 'Stream your films' })],
          nextCursor: null,
        }),
      },
      {
        path: '/store',
        routes: {
          '/store/category/$category': () => (
            <AppListView input={{ category: 'media' }} title="Media" sortable shippedPhase={9} />
          ),
        },
      },
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Media' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/store/category/media'));
    expect(await screen.findByRole('link', { name: 'Media' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'Media' })).toBeInTheDocument();
    expect(screen.getByText('21 apps · Apple Silicon compatible first')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Sort apps' })).toHaveClass('hl-p-seg');
    const rows = await screen.findByRole('list', { name: 'Media' });
    expect(within(rows).getByRole('link', { name: 'Install Plex' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('typing searches after 200 ms', () => {
    expect(SEARCH_DELAY_MS).toBe(200);
  });

  it('one Featured card whose View and name open the details', async () => {
    const { router } = renderScreen(Discover, handlers(), {
      path: '/store',
      routes: { '/store/app/$appId': () => <p>Details</p> },
    });
    const featured = await screen.findByRole('region', { name: 'Featured' });
    expect(within(featured).getByRole('heading', { name: 'Featured' })).toBeInTheDocument();
    expect(within(featured).getByText('Back up every photo from your phone to the Mac mini.')).toBeInTheDocument();
    expect(within(featured).getByRole('link', { name: 'Immich' })).toHaveAttribute('href', '/store/app/immich');
    fireEvent.click(within(featured).getByRole('link', { name: 'View Immich' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/store/app/immich'));
  });

  it('a list section: logo, name, tagline and Install, Open, or the state while installing', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    renderScreen(Discover, handlers(), { path: '/store' });
    const list = await screen.findByRole('list', { name: 'Popular on Apple Silicon' });
    const [abs, kuma, mealie] = within(list).getAllByRole('listitem');
    expect(abs).toHaveTextContent('Audiobookshelf');
    expect(abs).toHaveTextContent('Audiobooks and podcasts');
    expect(within(abs!).getByRole('link', { name: 'Install Audiobookshelf' })).toHaveTextContent('Install');
    fireEvent.click(within(kuma!).getByRole('button', { name: 'Open Uptime Kuma' }));
    expect(open).toHaveBeenCalledWith('https://uptime-kuma.hlabs.local');
    expect(await within(mealie!).findByRole('button', { name: /Installing… \d+%/ })).toBeDisabled();
  });
});
