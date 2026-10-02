// US-STORE-03 · Search from the store home: the store's search field.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { fakeMe } from '../test/me';
import { storeApp } from '../test/store';
import { SearchResults } from './search-results';
import { cleanQuery, SEARCH_DELAY_MS, StoreSearchField } from './search';

const handlers = {
  'store.getHome': () => ({ host: { os: 'linux', arm64: false }, featured: [], collections: [], totalApps: 240 }),
};

const field = () => screen.getByRole('searchbox', { name: 'Search apps' });
const ready = () => screen.findByRole('searchbox', { name: 'Search apps' });

describe('US-STORE-03', () => {
  it('says how many apps it searches', async () => {
    renderScreen(() => <StoreSearchField desktop />, handlers, { path: '/store' });
    await waitFor(() => expect(field()).toHaveAttribute('placeholder', 'Search 240 apps'));
  });

  it('opens the results after a 200 ms pause, not before', async () => {
    const { router } = renderScreen(() => <StoreSearchField desktop />, handlers, { path: '/store' });
    await ready();
    fireEvent.change(field(), { target: { value: 'photo' } });
    await act(() => new Promise((r) => setTimeout(r, SEARCH_DELAY_MS / 2)));
    expect(router.state.location.pathname).toBe('/store');
    await waitFor(() => expect(router.state.location.href).toBe('/store/search?q=photo'));
  });

  it('Enter opens the results at once', async () => {
    const { router } = renderScreen(() => <StoreSearchField desktop />, handlers, { path: '/store' });
    await ready();
    fireEvent.change(field(), { target: { value: 'kuma' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(router.state.location.href).toBe('/store/search?q=kuma'));
  });

  it('Escape clears the query', async () => {
    renderScreen(() => <StoreSearchField desktop />, handlers, { path: '/store' });
    await ready();
    fireEvent.change(field(), { target: { value: 'photo' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(field()).toHaveValue('');
  });

  it('"/" focuses the field on desktop, but not while typing elsewhere', async () => {
    renderScreen(
      () => (
        <>
          <input aria-label="Other" />
          <StoreSearchField desktop />
        </>
      ),
      handlers,
      { path: '/store' },
    );
    await ready();
    fireEvent.keyDown(window, { key: '/' });
    expect(field()).toHaveFocus();
    const other = screen.getByRole('textbox', { name: 'Other' });
    other.focus();
    fireEvent.keyDown(other, { key: '/' });
    expect(other).toHaveFocus();
  });

  it('queries are trimmed and capped at 100 characters', () => {
    expect(cleanQuery('  photo  ')).toBe('photo');
    expect(cleanQuery('x'.repeat(150))).toHaveLength(100);
  });
});

describe('US-STORE-03 · results, as the StoreSearch screen draws them', () => {
  const results = (arm64 = true) => ({
    'store.listApps': () => ({
      host: { os: 'macos', arm64 },
      title: null,
      nextCursor: null,
      items: [
        storeApp('immich', 'Immich', { installed: true, group: 'files', tagline: 'Phone photo backup' }),
        storeApp('photoprism', 'PhotoPrism', { group: 'files', tagline: 'Browse photos', arm64: false }),
        storeApp('piwigo', 'Piwigo', { group: 'files', tagline: 'Photo gallery' }),
      ],
    }),
    'apps.list': () => ({
      apps: [
        {
          id: 'immich',
          name: 'Immich',
          state: 'running',
          icon: { logoUrl: null, gradient: null, fallback: null },
          embed: false,
          urls: { local: 'https://immich.hlabs.local', tailnet: null },
        },
      ],
    }),
    'events.stream': () => new Promise(() => {}),
    'auth.me': fakeMe(),
  });

  it('one list: name, "tagline · category", Installed with Open, or a white Install', async () => {
    renderScreen(() => <SearchResults query="photo" />, results(), { path: '/store/search' });
    const list = await screen.findByRole('list', { name: 'Results for “photo”' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Phone photo backup · Files & photos')).toBeInTheDocument();
    expect(await within(rows[0]!).findByText('Installed')).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('button', { name: 'Open Immich' })).toBeInTheDocument();
    expect(within(rows[1]!).getByRole('link', { name: 'Install PhotoPrism' })).toHaveClass('hl-btn-primary');
  });

  it('chips count and filter: All · 3, Installed · 1, Apple Silicon only', async () => {
    renderScreen(() => <SearchResults query="photo" />, results(), { path: '/store/search' });
    const all = await screen.findByRole('button', { name: 'All · 3' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Installed · 1' }));
    expect(within(screen.getByRole('list', { name: 'Results for “photo”' })).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.click(all);
    fireEvent.click(screen.getByRole('button', { name: 'Apple Silicon only' }));
    const names = within(screen.getByRole('list', { name: 'Results for “photo”' }))
      .getAllByRole('listitem')
      .map((r) => within(r).getAllByRole('link')[0]!.textContent);
    expect(names).toEqual(['Immich', 'Piwigo']);
  });

  it('no "Apple Silicon only" off arm64; no "Add another app source" before phase 7 (D-036)', async () => {
    renderScreen(() => <SearchResults query="photo" />, results(false), { path: '/store/search' });
    await screen.findByRole('button', { name: 'All · 3' });
    expect(screen.queryByRole('button', { name: /only$/ })).toBeNull();
    expect(screen.queryByText('Add another app source')).toBeNull();
  });
});
