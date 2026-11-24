// US-TAB-02 · Long-press for every right-click menu: a finger held 500ms opens the menu (buzzing once), one that moves
// more than 10px first is a scroll, the click the press ends with is swallowed, and the OS's long-press menu opens
// ours instead; a Home tile lifts with the desktop's items beside it (TabletMenu); a file's long press opens its menu at
// the finger rather than selecting it; and a tap outside a menu closes it on its click, with nothing under it touched.
import type { FileEntry } from '@hlabs/api';
import { guardTapsOutsideMenus, useLongPress, type LongPressOptions } from '@hlabs/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileGrid } from '../files/file-grid';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { finger, tabletViewport } from '../test/tablet';
import type { HomeApp } from './app-grid';
import { HomeView } from './home-view';

const never = () => new Promise(() => {});
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

function Pressable(props: LongPressOptions & { onClick?: () => void }) {
  const press = useLongPress(props);
  return (
    <button
      type="button"
      onPointerDown={press.onPointerDown}
      onContextMenu={(e) => press.onContextMenu(e)}
      onClick={props.onClick}
    >
      Hold me
    </button>
  );
}

let restore: () => void;
beforeEach(() => {
  restore = tabletViewport();
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('US-TAB-02', () => {
  it('a finger held 500ms is a long press: it buzzes once, and the click it ends with opens nothing', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    render(<Pressable onLongPress={onLongPress} onClick={onClick} />);
    const el = screen.getByRole('button');
    fireEvent.pointerDown(el, finger(20, 20));
    await wait(450);
    expect(onLongPress).not.toHaveBeenCalled();
    await wait(100);
    expect(onLongPress).toHaveBeenCalledWith({ x: 20, y: 20 }, el);
    expect(vibrate).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(el, finger(20, 20));
    fireEvent.click(el, { clientX: 20, clientY: 20 });
    expect(onClick).not.toHaveBeenCalled();
    // A later tap is a tap.
    await wait(450);
    fireEvent.click(el, { clientX: 20, clientY: 20 });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a finger that moves more than 10px first is a scroll; a mouse is left to its right button', async () => {
    const onLongPress = vi.fn();
    render(<Pressable onLongPress={onLongPress} />);
    const el = screen.getByRole('button');
    fireEvent.pointerDown(el, finger(20, 20));
    fireEvent.pointerMove(el, finger(20, 31));
    await wait(600);
    expect(onLongPress).not.toHaveBeenCalled();
    // Within 10px it's still a press.
    fireEvent.pointerDown(el, finger(20, 20));
    fireEvent.pointerMove(el, finger(26, 26));
    await wait(550);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(el, finger(26, 26));
    fireEvent.pointerDown(el, { pointerType: 'mouse', clientX: 20, clientY: 20 });
    await wait(550);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("the OS's long-press menu never shows: it opens ours at once", () => {
    const onLongPress = vi.fn();
    render(<Pressable onLongPress={onLongPress} />);
    const el = screen.getByRole('button');
    fireEvent.pointerDown(el, finger(20, 20));
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(el, finger(20, 20));
  });

  it("a held Home tile lifts over Home with the desktop's items beside it, apart: Uninstall… and Edit Home", async () => {
    const app: HomeApp = {
      id: 'vaultwarden',
      name: 'Vaultwarden',
      state: 'running',
      icon: { logoUrl: null, gradient: null, fallback: null },
      embed: false,
      ownLogin: false,
      urls: { local: 'https://vaultwarden.hlabs.local', tailnet: null, port: null },
    };
    renderScreen(() => <HomeView shippedPhase={9} />, {
      'auth.me': fakeMe(),
      'home.getLayout': () => ({ items: [], hidden: [], dock: [] }),
      'apps.list': () => ({ apps: [app] }),
      'notifications.unreadCount': () => ({ count: 0 }),
      'events.stream': never,
    });
    const tile = await screen.findByRole('button', { name: 'Open Vaultwarden' });
    fireEvent.pointerDown(tile, finger());
    await wait(550);
    fireEvent.pointerUp(tile, finger());
    const menu = await screen.findByRole('menu', { name: /Vaultwarden/ });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Open', 'Settings', 'View logs', 'Restart', 'Stop', 'Uninstall…', 'Edit Home']);
    // The tablet's menu: the lifted tile with its name, the menu at its side (TabletMenu).
    expect(document.querySelector('.hl-t-menu-tile')).toHaveTextContent('Vaultwarden');
    expect(menu.querySelectorAll('.hl-p-menu-gap')).toHaveLength(2);
  });

  it("a file's long press opens its menu at the finger, not selecting it (D-176)", async () => {
    const entry: FileEntry = { name: 'note.txt', path: '/home/note.txt', kind: 'file', size: 5 } as FileEntry;
    const onMenu = vi.fn();
    const onLongPress = vi.fn();
    render(
      <FileGrid
        items={[entry]}
        label="Home"
        accent="violet"
        onOpen={() => {}}
        onMenu={onMenu}
        select={{
          selected: new Set(),
          onSelect: () => {},
          onToggle: () => {},
          onSelectAll: () => {},
          onLongPress,
        }}
      />,
    );
    const item = document.querySelector('[data-path="/home/note.txt"]')!;
    fireEvent.pointerDown(item, finger(40, 50));
    await wait(550);
    fireEvent.pointerUp(item, finger(40, 50));
    expect(onMenu).toHaveBeenCalledWith(entry, { x: 40, y: 50 });
    expect(onLongPress).not.toHaveBeenCalled();
    // A finger can't use the browser's drag: the item isn't draggable.
    expect(item.closest('[draggable="true"]')).toBeNull();
  });

  it('a tap outside an open menu closes it on its click, and nothing under it gets the tap', () => {
    const stop = guardTapsOutsideMenus();
    const under = vi.fn();
    const escape = vi.fn();
    render(
      <>
        <button type="button" onPointerDown={under} onClick={under}>
          Under
        </button>
        <div role="menu" onKeyDown={(e) => (e.key === 'Escape' ? escape() : undefined)}>
          <button type="button" role="menuitem">
            Open
          </button>
        </div>
      </>,
    );
    const target = screen.getByRole('button', { name: 'Under' });
    fireEvent.pointerDown(target, finger());
    // Not on the first touch.
    expect(escape).not.toHaveBeenCalled();
    fireEvent.click(target);
    expect(escape).toHaveBeenCalledTimes(1);
    expect(under).not.toHaveBeenCalled();
    // Taps in the menu are the menu's.
    fireEvent.pointerDown(screen.getByRole('menuitem'), finger());
    fireEvent.click(screen.getByRole('menuitem'));
    expect(escape).toHaveBeenCalledTimes(1);
    stop();
  });
});
