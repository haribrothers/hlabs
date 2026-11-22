// US-HOME-22 · Pin my favourite apps to the Dock: "+" lists the apps not pinned yet (or says the Dock is full), Add pins
// at the end, an app dropped from Home pins where it lands, each pinned app has a menu, and moving keeps the order.
import { Dock } from '@hlabs/ui';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { APPS, tile } from '../test/home-edit';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { useDockPins } from './dock-pins';

function DockHarness() {
  const dock = useDockPins(true, 7);
  return (
    <>
      <Dock
        areas={[{ id: 'home', label: 'Home' }]}
        apps={dock.apps}
        onAdd={dock.onAdd}
        onAppMenu={dock.onAppMenu}
        onMoveApp={dock.onMoveApp}
        onDropApp={dock.onDropApp}
        canDrop={dock.canDrop}
        search={false}
      />
      {dock.overlays}
    </>
  );
}

function dockWith(pinned: string[], role: 'admin' | 'member' = 'admin', apps = APPS) {
  const saves: string[][] = [];
  let dock = pinned;
  const r = renderScreen(
    DockHarness,
    {
      'auth.me': fakeMe({ role }),
      'home.getLayout': () => ({ items: [], dock, hidden: [] }),
      'apps.list': () => ({ apps }),
      'home.saveDock': (input) => {
        dock = (input as { appIds: string[] }).appIds;
        saves.push(dock);
        return { dock };
      },
    },
    { routes: { '/apps/$appId/settings': () => <h1>App settings page</h1> } },
  );
  return { ...r, saves };
}
const pinnedNames = () =>
  [...screen.getByRole('navigation', { name: 'Dock' }).querySelectorAll('[data-pinned]')].map((el) =>
    el.getAttribute('aria-label'),
  );

describe('US-HOME-22', () => {
  it('a new account has nothing pinned and the dashed "+" tile', async () => {
    dockWith([]);
    expect(await screen.findByRole('button', { name: 'Add to Dock' })).toBeInTheDocument();
    expect(pinnedNames()).toEqual([]);
  });

  it('"+" lists the apps not pinned yet with Add and the hint; Add pins at the end', async () => {
    const { saves } = dockWith(['vault']);
    await waitFor(() => expect(pinnedNames()).toEqual(['Vaultwarden']));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Dock' }));
    const pop = await screen.findByRole('dialog', { name: 'Add to Dock' });
    expect(
      within(pop)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('.truncate')?.textContent),
    ).toEqual(['Jellyfin', 'Immich']);
    expect(pop).toHaveTextContent('Or drag an app from Home onto the Dock. Up to 8 apps.');
    fireEvent.click(within(pop).getByRole('button', { name: 'Add Immich to the Dock' }));
    await waitFor(() => expect(saves).toEqual([['vault', 'immich']]));
    await waitFor(() => expect(pinnedNames()).toEqual(['Vaultwarden', 'Immich']));
  });

  it('with eight pinned, "+" says the Dock is full', async () => {
    const many = Array.from({ length: 9 }, (_, i) => tile(`a${i}`, `App ${i}`));
    dockWith(
      many.slice(0, 8).map((a) => a.id),
      'admin',
      many,
    );
    await waitFor(() => expect(pinnedNames()).toHaveLength(8));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Dock' }));
    const pop = await screen.findByRole('dialog', { name: 'Add to Dock' });
    expect(pop).toHaveTextContent('Your Dock is full. Remove an app to add another.');
    expect(within(pop).queryByRole('button', { name: /^Add / })).toBeNull();
  });

  it('an app dragged from Home pins where it lands; a pinned app moves with Alt+Arrow', async () => {
    const { saves } = dockWith(['vault', 'jellyfin']);
    await waitFor(() => expect(pinnedNames()).toEqual(['Vaultwarden', 'Jellyfin']));
    const nav = screen.getByRole('navigation', { name: 'Dock' });
    const dataTransfer = { types: ['application/x-hlabs-app'], getData: () => 'immich', dropEffect: '' };
    fireEvent.dragOver(nav, { dataTransfer, clientX: 0 });
    fireEvent.drop(nav, { dataTransfer, clientX: 0 });
    await waitFor(() => expect(saves.at(-1)).toEqual(['vault', 'jellyfin', 'immich']));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Immich' }), { key: 'ArrowLeft', altKey: true });
    await waitFor(() => expect(saves.at(-1)).toEqual(['vault', 'immich', 'jellyfin']));
  });

  it('a pinned app’s menu: Open, Open in a new tab, App settings (admins), Remove from Dock', async () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => {});
    const { saves } = dockWith(['vault', 'immich']);
    await waitFor(() => expect(pinnedNames()).toEqual(['Vaultwarden', 'Immich']));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Vaultwarden' }));
    let menu = await screen.findByRole('menu', { name: 'Vaultwarden' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Open', 'Open in a new tab', 'App settings', 'Remove from Dock']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Open in a new tab' }));
    expect(open).toHaveBeenCalledWith('https://vault.hlabs.local');
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Vaultwarden' }));
    menu = await screen.findByRole('menu', { name: 'Vaultwarden' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Remove from Dock' }));
    await waitFor(() => expect(saves.at(-1)).toEqual(['immich']));
    open.mockRestore();
  });

  it('members get no App settings in the menu', async () => {
    dockWith(['vault'], 'member');
    await waitFor(() => expect(pinnedNames()).toEqual(['Vaultwarden']));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Vaultwarden' }), { key: 'F10', shiftKey: true });
    const menu = await screen.findByRole('menu', { name: 'Vaultwarden' });
    expect(within(menu).queryByRole('menuitem', { name: 'App settings' })).toBeNull();
  });
});
