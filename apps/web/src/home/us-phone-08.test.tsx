// US-PHONE-08 · App grid and opening apps on phone: four to a row of 60px tiles with one-line names and "Install app"
// last; a running app opens at its address for the host in a new tab; an admin's tap on a stopped one opens its
// settings; a long press buzzes and opens the tile's menu over the blurred Home (D-172); a member is told whom to ask;
// the OS menu stays off the tiles; App settings are a full-height sheet with the tabs as a segmented control (D-166).
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { currentToasts, dismissToast } from '../lib/toasts';
import { Toaster } from '../shell/toaster';
import { fakeMe } from '../test/me';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppSettings } from '../apps/app-settings';
import { appUrl, type HomeApp } from './app-grid';
import { HomeView } from './home-view';

const never = () => new Promise(() => {});
const app = (id: string, name: string, state: HomeApp['state'], tailnet: string | null = null): HomeApp => ({
  id,
  name,
  state,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet, port: null },
});

function home(apps: HomeApp[], role: 'admin' | 'member' = 'admin') {
  return renderScreen(
    () => (
      <>
        <HomeView shippedPhase={9} />
        <Toaster />
      </>
    ),
    {
      'auth.me': fakeMe({ role, canInstallApps: role === 'admin' }),
      'home.getLayout': () => ({ items: [], hidden: [], dock: [] }),
      'apps.list': () => ({ apps }),
      'notifications.unreadCount': () => ({ count: 0 }),
      'account.get': () => ({ adminName: 'Hari' }),
      'events.stream': never,
    },
  );
}

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-PHONE-08', () => {
  it('four to a row, in layout order, then "Install app"', async () => {
    home([app('jellyfin', 'Jellyfin', 'running'), app('immich', 'Immich', 'running')]);
    const grid = await screen.findByRole('list', { name: 'Apps' });
    expect(grid).toHaveClass('grid-cols-4');
    const tiles = grid.querySelectorAll('li');
    expect(tiles[0]).toHaveTextContent('Jellyfin');
    expect(tiles[1]).toHaveTextContent('Immich');
    expect(tiles[2]).toHaveTextContent('Install app');
    // 60px tiles with the 16px radius on a phone, the logo the same box (D-172).
    const icon = tiles[0]!.querySelector<HTMLElement>('.hl-app-icon')!;
    expect(icon.style.width).toBe('60px');
    expect(icon.style.borderRadius).toBe('16px');
    expect((icon.firstElementChild as HTMLElement).style.width).toBe('60px');
    // One-line names, cut short with an ellipsis (phone.css).
    expect(tiles[0]!.querySelector('.hl-app-name')).not.toBeNull();
  });

  it('a running app opens in a new tab at its address for this host: the tailnet one on *.ts.net', async () => {
    const opened = vi.spyOn(browser, 'open').mockImplementation(() => {});
    const jellyfin = app('jellyfin', 'Jellyfin', 'running', 'https://hlabs.tail1234.ts.net:12000');
    const { router } = home([jellyfin]);
    fireEvent.click(await screen.findByRole('button', { name: 'Open Jellyfin' }));
    expect(opened).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
    expect(router.state.location.pathname).toBe('/');
    expect(appUrl(jellyfin, { hostname: 'hlabs.tail1234.ts.net' })).toBe('https://hlabs.tail1234.ts.net:12000');
  });

  it("an admin's tap on a stopped app opens its settings instead", async () => {
    const opened = vi.spyOn(browser, 'open').mockImplementation(() => {});
    const { router } = home([app('pihole', 'Pi-hole', 'stopped')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Pi-hole, stopped' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ settings: 'pihole' }));
    expect(opened).not.toHaveBeenCalled();
  });

  it('a member is told whom to ask, with no button', async () => {
    home([app('pihole', 'Pi-hole', 'stopped')], 'member');
    fireEvent.click(await screen.findByRole('button', { name: 'Pi-hole, stopped' }));
    expect(await screen.findByText("Pi-hole isn't running right now. Ask Hari to start it.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it("an admin's 500 ms press buzzes once and opens the tile's menu: Open, Settings, Logs, Restart, Uninstall…", async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const opened = vi.spyOn(browser, 'open').mockImplementation(() => {});
    const { router } = home([app('jellyfin', 'Jellyfin', 'running')]);
    const tile = await screen.findByRole('button', { name: 'Open Jellyfin' });
    // The OS's own menu is held back on tiles.
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    tile.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.pointerDown(tile, { pointerType: 'touch', clientX: 5, clientY: 5 });
    await act(() => new Promise((r) => setTimeout(r, 550)));
    fireEvent.pointerUp(tile, { pointerType: 'touch' });
    // The finger lifting after the menu opened doesn't open the app.
    fireEvent.click(tile);
    expect(opened).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledTimes(1);
    const items = await screen.findByRole('menu', { name: /Jellyfin/ });
    expect(
      within(items)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Open', 'Settings', 'Logs', 'Restart', 'Uninstall…']);
    // Over Home, which is blurred and dimmed behind it.
    expect(document.querySelector('.hl-p-menu-scrim')).not.toBeNull();
    fireEvent.click(within(items).getByRole('menuitem', { name: 'Settings' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ settings: 'jellyfin' }));
    expect(tile.closest('.hl-no-callout')).not.toBeNull();
  });

  it("a member's long press has Open only", async () => {
    home([app('jellyfin', 'Jellyfin', 'running')], 'member');
    const tile = await screen.findByRole('button', { name: 'Open Jellyfin' });
    fireEvent.pointerDown(tile, { pointerType: 'touch', clientX: 5, clientY: 5 });
    await act(() => new Promise((r) => setTimeout(r, 550)));
    fireEvent.pointerUp(tile, { pointerType: 'touch' });
    const items = await screen.findByRole('menu', { name: /Jellyfin/ });
    expect(
      within(items)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Open']);
  });

  it("an app's settings are a full-height sheet over the page, its tabs a segmented control", async () => {
    const vw = appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running' });
    const onClose = vi.fn();
    renderScreen(() => <AppSettings appId="vaultwarden" onClose={onClose} />, {
      'apps.get': () => vw,
      'auth.me': fakeMe(),
      'events.stream': never,
    });
    const sheet = await screen.findByRole('dialog', { name: 'Vaultwarden' });
    expect(sheet).toHaveClass('hl-sheet', 'hl-sheet-full');
    expect(sheet.querySelector('.hl-sheet-handle')).not.toBeNull();
    const tabs = within(sheet).getByRole('tablist');
    // The tabs that have shipped (all four in phase 7: the e2e checks them), in the sheet's segmented control.
    expect(tabs).toHaveClass('hl-seg');
    expect(within(tabs).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    // Open, Restart, Stop and Logs as tiles; Close goes back to the page.
    for (const name of ['Open', 'Restart', 'Stop', 'Logs'])
      expect(within(sheet).getByRole('button', { name })).toHaveClass('hl-p-action');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('"Install app" opens the App Store', async () => {
    const { router } = home([app('jellyfin', 'Jellyfin', 'running')]);
    fireEvent.click(await screen.findByRole('link', { name: 'Install app' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/store'));
  });
});
