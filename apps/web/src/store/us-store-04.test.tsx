// US-STORE-04 · Browse a category: the sort (Popular, New, A–Z) re-sorts at once and is remembered in this browser;
// "18 apps · showing Apple Silicon compatible first" (the second part on arm64 only); Open for an installed app, Install
// otherwise; the next 50 load as the end of the list comes into view; nothing of it before phase 7.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { storeApp } from '../test/store';
import { AppListView, SORT_KEY } from './app-list-view';

/** IntersectionObserver as jsdom lacks it: `reveal()` says the watched element came into view. */
const watched: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
class FakeObserver {
  constructor(private readonly cb: (entries: Array<{ isIntersecting: boolean }>) => void) {}
  observe() {
    watched.push(this.cb);
  }
  disconnect() {
    const i = watched.indexOf(this.cb);
    if (i >= 0) watched.splice(i, 1);
  }
}
const reveal = () => act(() => watched.forEach((cb) => cb([{ isIntersecting: true }])));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});
afterEach(() => vi.unstubAllGlobals());

const APPS = [
  storeApp('jellyfin', 'Jellyfin', { installed: true }),
  storeApp('navidrome', 'Navidrome'),
  storeApp('audiobookshelf', 'audiobookshelf'),
];
const ORDER = {
  popular: ['jellyfin', 'navidrome', 'audiobookshelf'],
  new: ['navidrome', 'audiobookshelf', 'jellyfin'],
  name: ['audiobookshelf', 'jellyfin', 'navidrome'],
};

function category(opts: { arm64?: boolean; os?: 'macos' | 'linux'; total?: number; shippedPhase?: number } = {}) {
  const r = renderScreen(
    () => <AppListView input={{ category: 'media' }} title="Media" sortable shippedPhase={opts.shippedPhase ?? 7} />,
    {
      'store.listApps': (input) => {
        const { sort = 'popular', cursor } = input as { sort?: keyof typeof ORDER; cursor?: string };
        const ids = cursor ? ['tdarr'] : ORDER[sort];
        return {
          host: { os: opts.os ?? 'macos', arm64: opts.arm64 ?? true },
          title: null,
          counts: { all: opts.total ?? 3, installed: 1 },
          items: cursor ? [storeApp('tdarr', 'Tdarr')] : ids.map((id) => APPS.find((a) => a.id === id)!),
          nextCursor: opts.total && !cursor ? '3' : null,
        };
      },
      'apps.list': () => ({
        apps: [
          {
            id: 'jellyfin',
            name: 'Jellyfin',
            state: 'running',
            icon: { logoUrl: null, gradient: null, fallback: null },
            embed: false,
            urls: { local: 'https://jellyfin.hlabs.local', tailnet: null },
          },
        ],
      }),
      'events.stream': () => new Promise(() => {}),
      'auth.me': fakeMe(),
    },
    { path: '/store/category/media' },
  );
  return r;
}

const names = () =>
  within(screen.getByRole('list', { name: 'Media' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('a')?.textContent);

describe('US-STORE-04', () => {
  it('"N apps · showing Apple Silicon compatible first" on an arm64 Mac; just the count elsewhere', async () => {
    category({ total: 18 });
    expect(await screen.findByText('18 apps · showing Apple Silicon compatible first')).toBeInTheDocument();
  });

  it('only the count off arm64', async () => {
    category({ arm64: false, os: 'linux' });
    expect(await screen.findByText('3 apps')).toBeInTheDocument();
  });

  it('Popular, New and A–Z re-sort at once, and the choice is remembered in this browser', async () => {
    const { calls, unmount } = category();
    const sorts = await screen.findByRole('radiogroup', { name: 'Sort apps' });
    expect(within(sorts).getByRole('radio', { name: 'Popular' })).toBeChecked();
    await waitFor(() => expect(names()).toEqual(['Jellyfin', 'Navidrome', 'audiobookshelf']));
    fireEvent.click(within(sorts).getByRole('radio', { name: 'New' }));
    await waitFor(() => expect(names()).toEqual(['Navidrome', 'audiobookshelf', 'Jellyfin']));
    expect(calls.filter((c) => c.path === 'store.listApps').at(-1)?.input).toMatchObject({ sort: 'new' });
    expect(localStorage.getItem(SORT_KEY)).toBe('new');
    unmount();
    category();
    const again = await screen.findByRole('radiogroup', { name: 'Sort apps' });
    expect(within(again).getByRole('radio', { name: 'New' })).toBeChecked();
    fireEvent.keyDown(within(again).getByRole('radio', { name: 'New' }), { key: 'ArrowRight' });
    await waitFor(() => expect(names()).toEqual(['audiobookshelf', 'Jellyfin', 'Navidrome']));
    expect(within(again).getByRole('radio', { name: 'A–Z' })).toHaveFocus();
  });

  it('an installed app opens in a new tab; the others install from their details', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    category();
    fireEvent.click(await screen.findByRole('button', { name: 'Open Jellyfin' }));
    expect(open).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
    expect(screen.getByRole('link', { name: 'Install Navidrome' })).toHaveAttribute(
      'href',
      '/store/app/navidrome?install=true',
    );
    open.mockRestore();
  });

  it('the next page loads as the end of the list comes into view', async () => {
    const { calls } = category({ total: 4 });
    await waitFor(() => expect(names()).toHaveLength(3));
    reveal();
    await waitFor(() => expect(names()).toEqual(['Jellyfin', 'Navidrome', 'audiobookshelf', 'Tdarr']));
    expect(calls.filter((c) => c.path === 'store.listApps').at(-1)?.input).toMatchObject({ cursor: '3' });
  });

  it('before phase 7 a category has no sort and no count', async () => {
    category({ shippedPhase: 6 });
    await waitFor(() => expect(names()).toHaveLength(3));
    expect(screen.queryByRole('radiogroup', { name: 'Sort apps' })).toBeNull();
    expect(screen.queryByText('3 apps · showing Apple Silicon compatible first')).toBeNull();
  });
});
