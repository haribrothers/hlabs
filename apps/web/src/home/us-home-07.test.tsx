// US-HOME-07 · Act on an app from its menu.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import type { HomeApp } from './app-grid';
import { HomeView } from './home-view';
import { LONG_PRESS_MS } from './tile-menu';

const app = (id: string, name: string, state: HomeApp['state']): HomeApp => ({
  id,
  name,
  state,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});

function home(apps: HomeApp[], handlers: Handlers = {}, role: 'admin' | 'member' = 'admin') {
  const list = { apps };
  let publish!: (event: unknown) => void;
  const event = new Promise((r) => (publish = r));
  const rendered = renderScreen(() => <HomeView />, {
    'auth.me': fakeMe({ role }),
    'home.getLayout': () => ({ items: [], dock: [] }),
    'apps.list': () => structuredClone(list),
    'events.stream': () => event,
    ...handlers,
  });
  /** The daemon reports a new state: the list says so from now on, and the event refetches it. */
  const changed = async (appId: string, state: HomeApp['state']) => {
    list.apps = list.apps.map((a) => (a.id === appId ? { ...a, state } : a));
    await act(async () =>
      publish({ id: '1', data: { type: 'app.stateChanged', data: { appId, state, detail: null } } }),
    );
  };
  return { ...rendered, changed };
}

// The first render loads Home's widgets too, which can take more than a second on CI.
const tile = (name: RegExp | string) => screen.findByRole('button', { name }, { timeout: 5_000 });
const menuItems = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole('menuitem')
    .map((i) => i.textContent);

afterEach(() => {
  vi.useRealTimers();
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-HOME-07', () => {
  it('right-clicking a running app opens its menu with the name and every action, Uninstall last in danger', async () => {
    home([app('vault', 'Vaultwarden', 'running')]);
    fireEvent.contextMenu(await tile('Open Vaultwarden'));
    const menu = await screen.findByRole('menu', { name: 'Vaultwarden' });
    expect(within(menu).getByText('Vaultwarden')).toBeInTheDocument();
    expect(menuItems(menu)).toEqual(['Open', 'Settings', 'View logs', 'Restart', 'Stop', 'Uninstall…']);
    expect(within(menu).getByRole('menuitem', { name: 'Uninstall…' })).toHaveClass('hl-menu-danger');
    expect(within(menu).getAllByRole('separator')).toHaveLength(2);
  });

  it('a stopped app offers Start in place of Stop, and no Restart', async () => {
    home([app('pihole', 'Pi-hole', 'stopped')]);
    fireEvent.contextMenu(await tile('Pi-hole, stopped'));
    const menu = await screen.findByRole('menu');
    expect(menuItems(menu)).toEqual(['Open', 'Settings', 'View logs', 'Start', 'Uninstall…']);
  });

  it.each(['installing', 'updating', 'uninstalling'] as const)('while %s only View logs works', async (state) => {
    home([app('nc', 'Nextcloud', state)]);
    fireEvent.contextMenu(await tile(/^Nextcloud, /));
    const menu = await screen.findByRole('menu');
    expect(menuItems(menu)).toEqual(['Open', 'View logs']);
    expect(within(menu).getByRole('menuitem', { name: 'Open' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('Restart moves the tile at once and a toast confirms once it runs again', async () => {
    const { calls, changed } = home([app('vault', 'Vaultwarden', 'running')], { 'apps.restart': () => ({ ok: true }) });
    fireEvent.contextMenu(await tile('Open Vaultwarden'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restart' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'apps.restart', input: { appId: 'vault' } }));
    expect(await tile('Vaultwarden, restarting')).toHaveTextContent('Restarting…');
    await changed('vault', 'running');
    await waitFor(() =>
      expect(currentToasts()).toContainEqual(
        expect.objectContaining({ tone: 'success', title: 'Vaultwarden restarted' }),
      ),
    );
  });

  it('Stop confirms the same way', async () => {
    const { changed } = home([app('vault', 'Vaultwarden', 'running')], { 'apps.stop': () => ({ ok: true }) });
    fireEvent.contextMenu(await tile('Open Vaultwarden'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Stop' }));
    expect(await tile('Vaultwarden, stopping')).toBeInTheDocument();
    await changed('vault', 'stopped');
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Vaultwarden stopped'));
  });

  it('Start confirms the same way', async () => {
    const { changed } = home([app('vault', 'Vaultwarden', 'stopped')], { 'apps.start': () => ({ ok: true }) });
    fireEvent.contextMenu(await tile('Vaultwarden, stopped'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Start' }));
    expect(await tile('Vaultwarden, starting')).toBeInTheDocument();
    await changed('vault', 'running');
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Vaultwarden started'));
  });

  it('a refused command says why in a toast', async () => {
    home([app('vault', 'Vaultwarden', 'running')], {
      'apps.restart': () => Promise.reject(daemonError('ENGINE_UNAVAILABLE')),
    });
    fireEvent.contextMenu(await tile('Open Vaultwarden'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restart' }));
    await waitFor(() => expect(currentToasts()).toContainEqual(expect.objectContaining({ tone: 'danger' })));
    expect(await tile('Open Vaultwarden')).toBeInTheDocument();
  });

  it('Settings and View logs open those views for the app', async () => {
    const { router } = home([app('vault', 'Vaultwarden', 'running')]);
    fireEvent.contextMenu(await tile('Open Vaultwarden'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Settings' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/apps/vault/settings'));
    await act(() => router.navigate({ to: '/' as never }));
    fireEvent.contextMenu(await tile('Open Vaultwarden'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'View logs' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/apps/vault/logs'));
  });

  it('Uninstall… opens the uninstall dialog for the app', async () => {
    home([app('vault', 'Vaultwarden', 'running')], {
      'apps.get': () => appDetail({ id: 'vault', name: 'Vaultwarden', state: 'running' }),
    });
    fireEvent.contextMenu(await tile('Open Vaultwarden'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Uninstall…' }));
    expect(await screen.findByRole('alertdialog', { name: 'Uninstall Vaultwarden?' })).toBeInTheDocument();
  });

  it('Escape closes the menu and focus goes back to the tile', async () => {
    home([app('vault', 'Vaultwarden', 'running')]);
    const vault = await tile('Open Vaultwarden');
    fireEvent.contextMenu(vault);
    const menu = await screen.findByRole('menu');
    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(vault).toHaveFocus());
  });

  it('Shift+F10 or the Menu key opens it from the keyboard', async () => {
    home([app('vault', 'Vaultwarden', 'running')]);
    const vault = await tile('Open Vaultwarden');
    vault.focus();
    fireEvent.keyDown(vault, { key: 'F10', shiftKey: true });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    fireEvent.keyDown(vault, { key: 'ContextMenu' });
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it(`a ${LONG_PRESS_MS} ms long press on touch opens it, and doesn't open the app`, async () => {
    home([app('vault', 'Vaultwarden', 'running')]);
    const vault = await tile('Open Vaultwarden');
    vi.useFakeTimers();
    fireEvent.pointerDown(vault, { pointerType: 'touch', clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(LONG_PRESS_MS));
    vi.useRealTimers();
    fireEvent.pointerUp(vault, { pointerType: 'touch' });
    const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(vault);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(opened).not.toHaveBeenCalled();
  });

  it('members get only Open', async () => {
    home([app('vault', 'Vaultwarden', 'running')], {}, 'member');
    fireEvent.contextMenu(await tile('Open Vaultwarden'));
    expect(menuItems(await screen.findByRole('menu'))).toEqual(['Open']);
  });
});
