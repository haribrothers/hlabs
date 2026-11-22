// US-HOME-16 · Enter and leave edit mode: from a tile's menu, a right-click or a long press on the wallpaper (never a long
// press on a tile); the greeting, remove buttons and toolbar; nothing opens; Done saves, a failed save keeps editing;
// Escape throws the changes away; Wallpaper opens Appearance.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { daemonError } from '../test/render';
import { homeAt7 } from '../test/home-edit';

afterEach(() => vi.useRealTimers());

async function enterFromTile() {
  const tileButton = await screen.findByRole('button', { name: 'Open Jellyfin' });
  fireEvent.contextMenu(tileButton.closest('li')!.firstElementChild!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Home' }));
  await screen.findByRole('heading', { level: 1, name: 'Drag to rearrange' });
}

describe('US-HOME-16', () => {
  it('"Edit Home" from a tile’s menu: "Drag to rearrange", a remove button on each widget and tile, and the toolbar', async () => {
    homeAt7();
    await enterFromTile();
    expect(screen.getByRole('button', { name: 'Remove widget' })).toBeInTheDocument();
    for (const app of ['Jellyfin', 'Immich', 'Vaultwarden'])
      expect(screen.getByRole('button', { name: `Remove ${app} from Home` })).toBeInTheDocument();
    const bar = screen.getByRole('toolbar', { name: 'Editing Home' });
    expect(within(bar).getByText('Editing Home')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Add widget' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Wallpaper' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Done' })).toHaveClass('hl-btn-primary');
    // Tiles can't be opened while editing, and "Install app" is hidden.
    expect(screen.queryByRole('button', { name: 'Open Jellyfin' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Install app' })).toBeNull();
  });

  it('a right-click on the wallpaper offers "Edit Home"', async () => {
    homeAt7();
    await screen.findByRole('button', { name: 'Open Jellyfin' });
    fireEvent.contextMenu(document.getElementById('main')!);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Home' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Drag to rearrange' })).toBeInTheDocument();
  });

  it('a 500 ms press on an empty part of Home starts it; a long press on a tile never does', async () => {
    homeAt7();
    const tileButton = await screen.findByRole('button', { name: 'Open Jellyfin' });
    vi.useFakeTimers();
    fireEvent.pointerDown(tileButton, { button: 0, pointerType: 'touch', clientX: 5, clientY: 5 });
    act(() => vi.advanceTimersByTime(600));
    fireEvent.pointerUp(tileButton, { pointerType: 'touch' });
    expect(screen.queryByRole('heading', { level: 1, name: 'Drag to rearrange' })).toBeNull();

    const main = document.getElementById('main')!;
    fireEvent.pointerDown(main, { button: 0, clientX: 5, clientY: 5 });
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole('heading', { level: 1, name: 'Drag to rearrange' })).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    vi.useRealTimers();
    expect(await screen.findByRole('heading', { level: 1, name: 'Drag to rearrange' })).toBeInTheDocument();
  });

  it('Done saves the layout and leaves edit mode', async () => {
    const { saved } = homeAt7();
    await enterFromTile();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Immich from Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('button', { name: 'Open Jellyfin' });
    expect(saved).toEqual([
      {
        items: [
          { kind: 'widget', id: 'storage' },
          { kind: 'app', id: 'jellyfin' },
          { kind: 'app', id: 'vault' },
        ],
        hidden: ['immich'],
      },
    ]);
    expect(screen.queryByRole('button', { name: 'Open Immich' })).toBeNull();
  });

  it('a failed save says so and keeps edit mode open with the changes', async () => {
    homeAt7({
      'home.saveLayout': () => {
        throw daemonError('INTERNAL');
      },
    });
    await enterFromTile();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Immich from Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByText("Couldn't save your Home. Try again.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Drag to rearrange' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Immich from Home' })).toBeNull();
  });

  it('Escape throws away every change and leaves edit mode', async () => {
    const { saved } = homeAt7();
    await enterFromTile();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Immich from Home' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findByRole('button', { name: 'Open Immich' })).toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it('Wallpaper opens Settings › Appearance', async () => {
    homeAt7({}, { routes: { '/settings/$section': () => <h1>Appearance page</h1> } });
    await enterFromTile();
    fireEvent.click(screen.getByRole('button', { name: 'Wallpaper' }));
    expect(await screen.findByRole('heading', { name: 'Appearance page' })).toBeInTheDocument();
  });
});

describe('US-HOME-18', () => {
  it('"–" takes a widget or an app off Home with no dialog, and nothing is stopped or uninstalled', async () => {
    const { calls, saved } = homeAt7({}, { widgets: ['storage', 'live-usage'] });
    await enterFromTile();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove widget' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Vaultwarden from Home' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      items: [
        { kind: 'widget', id: 'live-usage' },
        { kind: 'app', id: 'jellyfin' },
        { kind: 'app', id: 'immich' },
      ],
      hidden: ['vault'],
    });
    expect(calls.filter((c) => /apps\.(stop|uninstall)/.test(c.path))).toEqual([]);
  });

  it('removing an app and then a widget keeps both changes', async () => {
    const { saved } = homeAt7({}, { widgets: ['storage', 'live-usage'] });
    await enterFromTile();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Vaultwarden from Home' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove widget' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.hidden).toEqual(['vault']);
  });

  it('an app taken off Home isn’t on the grid but is still installed', async () => {
    homeAt7({}, { hidden: ['vault'] });
    await screen.findByRole('button', { name: 'Open Jellyfin' });
    expect(screen.queryByRole('button', { name: 'Open Vaultwarden' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'No apps yet' })).toBeNull();
  });
});
