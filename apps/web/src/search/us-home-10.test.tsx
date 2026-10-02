// US-HOME-10 · Find apps, actions, files, settings and store apps in one list.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { closeSearch, openSearch } from './search-state';
import { Spotlight } from './spotlight';

const jellyfin = {
  id: 'jellyfin',
  name: 'Jellyfin',
  state: 'running' as const,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  urls: { local: 'https://jellyfin.hlabs.local', tailnet: null },
};
const jellyseerr = {
  id: 'jellyseerr',
  sourceId: 'builtin',
  name: 'Jellyseerr',
  tagline: 'Media requests',
  category: 'media',
  group: 'media' as const,
  icon: { logoUrl: null, gradient: null, fallback: null },
  tags: [],
  arm64: true,
  installed: false,
};
const FULL = {
  installed: [jellyfin],
  actions: [
    { kind: 'settings', appId: 'jellyfin', appName: 'Jellyfin' },
    { kind: 'restart', appId: 'jellyfin', appName: 'Jellyfin' },
    { kind: 'logs', appId: 'jellyfin', appName: 'Jellyfin' },
  ],
  store: [jellyseerr],
  storeTotal: 4,
  files: null,
  settings: [{ section: 'account', title: 'Account' }],
};
const EMPTY = { installed: [], actions: [], store: [], storeTotal: 0, files: null, settings: [] };

function open(handlers: Handlers = {}, role: 'admin' | 'member' = 'admin') {
  const rendered = renderScreen(() => <Spotlight />, {
    'auth.me': fakeMe({ role }),
    'home.searchEverything': (input) => ((input as { query: string }).query ? FULL : EMPTY),
    ...handlers,
  });
  act(() => openSearch());
  return rendered;
}

async function type(text: string) {
  const field = await screen.findByRole('combobox', { name: 'Search' });
  fireEvent.change(field, { target: { value: text } });
  return field;
}

const options = () => screen.getAllByRole('option');
const highlighted = () => screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true');

afterEach(() => {
  act(() => closeSearch());
  vi.restoreAllMocks();
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-HOME-10', () => {
  it('groups results as Installed, Actions, App Store (with See all), Settings; Files waits for phase 5', async () => {
    open();
    await type('jelly');
    const list = await screen.findByRole('listbox');
    await within(list).findByRole('group', { name: 'Actions' });
    const headings = within(list)
      .getAllByRole('group')
      .map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)?.textContent);
    expect(headings).toEqual(['Installed', 'Actions', 'App Store', 'Settings']);
    expect(options().map((o) => o.textContent)).toEqual([
      expect.stringContaining('Jellyfin'),
      'Jellyfin settings',
      'Restart Jellyfin',
      'View Jellyfin logs',
      expect.stringMatching(/Jellyseerr.*Media requests · Install/),
      'See all App Store results',
      'Account',
    ]);
  });

  it('waits for typing to pause before searching', async () => {
    const { calls } = open();
    const field = await type('j');
    fireEvent.change(field, { target: { value: 'je' } });
    fireEvent.change(field, { target: { value: 'jelly' } });
    await screen.findByRole('group', { name: 'Actions' });
    const queries = calls
      .filter((c) => c.path === 'home.searchEverything')
      .map((c) => (c.input as { query: string }).query);
    expect(queries).toEqual(['', 'jelly']);
  });

  it('↑ ↓ move across every group, wrapping; ↵ opens an app as its tile does', async () => {
    const opened = vi.spyOn(browser, 'open').mockImplementation(() => {});
    open();
    const field = await type('jelly');
    await screen.findByRole('group', { name: 'Actions' });
    expect(highlighted()).toHaveTextContent('Jellyfin');
    expect(highlighted()).toHaveTextContent('Open ↵');
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(highlighted()).toHaveTextContent('Account');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(highlighted()).toHaveTextContent('Jellyfin');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(opened).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it.each([
    ['Jellyfin settings', '/apps/jellyfin/settings'],
    ['View Jellyfin logs', '/apps/jellyfin/logs'],
    ['Jellyseerr', '/store/app/jellyseerr'],
    ['Account', '/settings/account'],
  ])('choosing "%s" opens %s', async (name, path) => {
    const { router } = open();
    await type('jelly');
    fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${name}`) }));
    await waitFor(() => expect(router.state.location.pathname).toBe(path));
  });

  it('"See all App Store results" opens the store search with the query', async () => {
    const { router } = open();
    await type('jelly');
    fireEvent.click(await screen.findByRole('option', { name: 'See all App Store results' }));
    await waitFor(() => expect(router.state.location.href).toBe('/store/search?q=jelly'));
  });

  it('"Restart Jellyfin" restarts it at once and a toast confirms', async () => {
    const { calls } = open({ 'apps.restart': () => ({ ok: true }) });
    await type('jelly');
    fireEvent.click(await screen.findByRole('option', { name: 'Restart Jellyfin' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'apps.restart', input: { appId: 'jellyfin' } }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Restarting Jellyfin…'));
  });

  it('no matches: "No results for “…”" and the App Store link', async () => {
    open({ 'home.searchEverything': () => EMPTY });
    await type('zzz');
    expect(await screen.findByText('No results for “zzz”')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'See all App Store results' })).toBeInTheDocument();
  });

  it("members: no App Store group or link when they can't install", async () => {
    open(
      {
        'home.searchEverything': (input) =>
          (input as { query: string }).query ? { ...EMPTY, installed: [jellyfin], store: null } : EMPTY,
      },
      'member',
    );
    await type('jelly');
    await screen.findByRole('group', { name: 'Installed' });
    expect(screen.queryByRole('group', { name: 'App Store' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'See all App Store results' })).toBeNull();
  });

  it('a failed search says so and keeps what was typed', async () => {
    open({
      'home.searchEverything': (input) =>
        (input as { query: string }).query ? Promise.reject(daemonError('INTERNAL')) : EMPTY,
    });
    const field = await type('jelly');
    expect(await screen.findByText("Search isn't available right now")).toBeInTheDocument();
    expect(field).toHaveValue('jelly');
  });
});
