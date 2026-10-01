// US-HOME-09 · Open search from anywhere.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchPill } from '../home/home-view';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { closeSearch, isMac, isSearchShortcut } from './search-state';
import { Spotlight, useSearchShortcut } from './spotlight';

const app = (id: string, name: string) => ({
  id,
  name,
  state: 'running' as const,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null },
});
const results = (installed = [app('jellyfin', 'Jellyfin'), app('immich', 'Immich')]) => ({
  installed,
  actions: [],
  store: [],
  storeTotal: 0,
  files: null,
  settings: [],
});

function Dashboard() {
  useSearchShortcut(true);
  return (
    <>
      <button type="button">Somewhere</button>
      <input aria-label="Own field" data-owns-mod-k="" />
      <SearchPill />
      <Spotlight />
    </>
  );
}

function render() {
  return renderScreen(() => <Dashboard />, {
    'auth.me': fakeMe({ role: 'admin' }),
    'home.searchEverything': () => results(),
  });
}

/** ⌘K here (jsdom isn't a Mac): Ctrl+K. */
const shortcut = (target: Element = document.body) => fireEvent.keyDown(target, { key: 'k', ctrlKey: true });

afterEach(() => act(() => closeSearch()));

describe('US-HOME-09', () => {
  it('⌘K on a Mac and Ctrl+K elsewhere', () => {
    const k = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { key: 'k', ...init });
    expect(isSearchShortcut(k({ metaKey: true }), true)).toBe(true);
    expect(isSearchShortcut(k({ ctrlKey: true }), true)).toBe(false);
    expect(isSearchShortcut(k({ ctrlKey: true }), false)).toBe(true);
    expect(isSearchShortcut(k({ metaKey: true }), false)).toBe(false);
    expect(isMac({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isMac({ platform: 'Linux x86_64', userAgent: '' })).toBe(false);
  });

  it('the shortcut opens Search with focus in the field; again, or Escape, closes it', async () => {
    render();
    await screen.findByRole('button', { name: 'Somewhere' });
    shortcut();
    const panel = await screen.findByRole('dialog', { name: 'Search' });
    const field = within(panel).getByRole('combobox', { name: 'Search' });
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAttribute('placeholder', 'Search');
    shortcut(field);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    shortcut();
    fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Search' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the Home pill opens the same panel and shows the shortcut', async () => {
    render();
    const pill = await screen.findByRole('button', { name: /Search apps, files, settings/ });
    expect(pill).toHaveTextContent('Ctrl K');
    fireEvent.click(pill);
    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeInTheDocument();
  });

  it('with nothing typed it lists the installed apps under "Installed", and the footer hints', async () => {
    render();
    await screen.findByRole('button', { name: 'Somewhere' });
    shortcut();
    const panel = await screen.findByRole('dialog', { name: 'Search' });
    const installed = await within(panel).findByRole('group', { name: 'Installed' });
    expect(
      within(installed)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([expect.stringContaining('Jellyfin'), expect.stringContaining('Immich')]);
    expect(panel).toHaveTextContent('to move');
    expect(panel).toHaveTextContent('to open');
    expect(panel).toHaveTextContent('to close');
  });

  it('closing returns focus to what had it', async () => {
    render();
    const before = await screen.findByRole('button', { name: 'Somewhere' });
    before.focus();
    shortcut(before);
    await screen.findByRole('dialog', { name: 'Search' });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search' }), { key: 'Escape' });
    await waitFor(() => expect(before).toHaveFocus());
  });

  it('a field that uses ⌘K itself keeps it', async () => {
    render();
    const own = await screen.findByRole('textbox', { name: 'Own field' });
    shortcut(own);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
