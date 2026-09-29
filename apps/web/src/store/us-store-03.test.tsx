// US-STORE-03 · Search from the store home: the store's search field.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
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
