// US-STORE-01 · Browse the store home.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { renderScreen } from '../test/render';
import { storeApp } from '../test/store';
import { Discover } from './discover';
import { cardAction, storeTags, type InstalledApp } from './store-app';

afterEach(() => vi.restoreAllMocks());

const installed = (id: string, state: InstalledApp['state']): InstalledApp => ({
  id,
  name: id,
  state,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null },
});

const home = {
  host: { os: 'macos', arm64: true },
  featured: [
    storeApp('immich', 'Immich', { tags: ['local-ai'] }),
    storeApp('open-webui', 'Open WebUI', { tags: ['local-ai'], group: 'ai', category: 'ai' }),
  ],
  collections: [
    {
      id: 'popular',
      title: 'Popular with families',
      apps: [storeApp('immich', 'Immich'), storeApp('uptime-kuma', 'Uptime Kuma'), storeApp('gitea', 'Gitea')],
    },
  ],
  totalApps: 3,
};

const never = () => new Promise(() => {});

describe('US-STORE-01', () => {
  it('buttons: Install when not installed, Open when installed, Installing… with the percent while installing', () => {
    const app = storeApp('immich', 'Immich');
    const at = { hostname: 'hlabs.local' };
    expect(cardAction(app, undefined, undefined, at)).toEqual({ kind: 'install' });
    expect(cardAction(app, installed('immich', 'running'), undefined, at)).toEqual({
      kind: 'open',
      url: 'https://immich.hlabs.local',
    });
    expect(cardAction(app, installed('immich', 'installing'), 41.6, at)).toEqual({ kind: 'installing', percent: 42 });
    expect(cardAction(app, installed('immich', 'install_failed'), undefined, at)).toEqual({ kind: 'install' });
    // Installed by an admin but not shared with this member.
    expect(cardAction({ ...app, installed: true }, undefined, undefined, at)).toEqual({ kind: 'installed' });
  });

  it('tags: "Apple Silicon" on an arm64 Mac, "ARM64" on arm64 Linux, none without an arm64 image or host', () => {
    const app = storeApp('immich', 'Immich', { tags: ['local-ai', 'something-else'] });
    expect(storeTags(app, { os: 'macos', arm64: true })).toEqual(['Apple Silicon', 'Local AI']);
    expect(storeTags(app, { os: 'linux', arm64: true })).toEqual(['ARM64', 'Local AI']);
    expect(storeTags(app, { os: 'linux', arm64: false })).toEqual(['Local AI']);
    expect(storeTags({ ...app, arm64: false }, { os: 'macos', arm64: true })).toEqual(['Local AI']);
  });

  it('shows Featured and the rows with "See all"; the card body and Install go to the details', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    renderScreen(
      Discover,
      {
        'store.getHome': () => home,
        'apps.list': () => ({ apps: [installed('uptime-kuma', 'running')] }),
        'events.stream': never,
      },
      { path: '/store' },
    );
    const featured = await screen.findByRole('region', { name: 'Featured' });
    // The lead card says Featured; the next says its tag, which isn't repeated as a chip (the AppStore screen).
    const [lead, next] = within(featured).getAllByRole('listitem');
    expect(within(lead!).getByText('Featured', { selector: 'span.uppercase' })).toBeInTheDocument();
    expect(within(lead!).getByText('Local AI')).toBeInTheDocument();
    expect(within(next!).getByText('Local AI', { selector: 'span.uppercase' })).toBeInTheDocument();
    expect(within(next!).getAllByText('Local AI')).toHaveLength(1);
    expect(within(lead!).getByText('Apple Silicon')).toBeInTheDocument();
    const row = screen.getByRole('region', { name: 'Popular with families' });
    expect(screen.getByRole('link', { name: 'See all Popular with families' })).toHaveAttribute(
      'href',
      '/store/collection/popular',
    );
    // Install opens the details page with the install sheet open.
    expect(within(row).getByRole('link', { name: 'Install Gitea' })).toHaveAttribute(
      'href',
      '/store/app/gitea?install=true',
    );
    expect(within(row).getByRole('link', { name: 'Gitea' })).toHaveAttribute('href', '/store/app/gitea');
    fireEvent.click(within(row).getByRole('button', { name: 'Open Uptime Kuma' }));
    expect(open).toHaveBeenCalledWith('https://uptime-kuma.hlabs.local');
  });
});
