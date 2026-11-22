import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dock, DOCK_DRAG_TYPE, TabBar, UiStringsProvider, type AreaItem } from '../src/index';

const AREAS: AreaItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'store', label: 'App Store' },
  { id: 'files', label: 'Files' },
  { id: 'usage', label: 'Usage' },
  { id: 'backups', label: 'Backups' },
  { id: 'settings', label: 'Settings' },
];

describe('Dock (D-054)', () => {
  const apps = [
    { id: 'immich', name: 'Immich', logo: '/logo.svg', open: true, pinned: true },
    { id: 'jellyfin', name: 'Jellyfin', colors: ['#000000', '#111111'] as const, badge: 3, pinned: true },
  ];

  it('orders areas, pinned apps, the + tile and Search, and marks the current area', () => {
    render(<Dock areas={AREAS} active="home" apps={apps} badges={{ store: 2 }} onAdd={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Dock' });
    const names = Array.from(nav.querySelectorAll('[data-dock]')).map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Home',
      'App Store, 2 updates',
      'Files',
      'Usage',
      'Backups',
      'Settings',
      'Immich, open',
      'Jellyfin',
      'Add to Dock',
      'Search',
    ]);
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Files' })).not.toHaveAttribute('aria-current');
  });

  it('moves focus with arrow keys and Home/End, and opens with Enter', async () => {
    const onSelect = vi.fn();
    render(<Dock areas={AREAS} active="home" onSelect={onSelect} />);
    screen.getByRole('button', { name: 'Home' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'App Store' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
    screen.getByRole('button', { name: 'Files' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('files');
  });

  it('opens the pinned-app menu on right-click, never for areas', () => {
    const onAppMenu = vi.fn();
    render(<Dock areas={AREAS} apps={apps} onAppMenu={onAppMenu} />);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Immich, open' }));
    expect(onAppMenu).toHaveBeenCalledWith('immich', expect.anything());
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Files' }));
    expect(onAppMenu).toHaveBeenCalledTimes(1);
  });

  it('opens the pinned-app menu on a long press (touch) without also opening the app', () => {
    vi.useFakeTimers();
    const onAppMenu = vi.fn();
    const onOpenApp = vi.fn();
    render(<Dock areas={AREAS} apps={apps} onAppMenu={onAppMenu} onOpenApp={onOpenApp} />);
    const tile = screen.getByRole('button', { name: 'Jellyfin' });
    fireEvent.pointerDown(tile, { pointerType: 'touch' });
    vi.advanceTimersByTime(600);
    fireEvent.pointerUp(tile, { pointerType: 'touch' });
    fireEvent.click(tile);
    expect(onAppMenu).toHaveBeenCalledWith('jellyfin', expect.anything());
    expect(onOpenApp).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('US-HOME-22: Shift+F10 opens a pinned app’s menu; Alt+Left/Right moves it; an open-only app has neither', () => {
    const onAppMenu = vi.fn();
    const onMoveApp = vi.fn();
    render(
      <Dock
        areas={AREAS}
        apps={[...apps, { id: 'gitea', name: 'Gitea', open: true }]}
        onAppMenu={onAppMenu}
        onMoveApp={onMoveApp}
      />,
    );
    const jelly = screen.getByRole('button', { name: 'Jellyfin' });
    fireEvent.keyDown(jelly, { key: 'F10', shiftKey: true });
    expect(onAppMenu).toHaveBeenCalledWith('jellyfin', jelly);
    fireEvent.keyDown(jelly, { key: 'ArrowLeft', altKey: true });
    expect(onMoveApp).toHaveBeenCalledWith('jellyfin', 0);
    fireEvent.keyDown(jelly, { key: 'ArrowRight', altKey: true });
    expect(onMoveApp).toHaveBeenCalledTimes(1); // already last of the pinned apps
    const gitea = screen.getByRole('button', { name: 'Gitea, open' });
    fireEvent.contextMenu(gitea);
    fireEvent.keyDown(gitea, { key: 'ContextMenu' });
    expect(onAppMenu).toHaveBeenCalledTimes(1);
  });

  it('US-HOME-22: the + tile gives its tile; an app dragged from Home opens a gap and drops where it lands', () => {
    const onAdd = vi.fn();
    const onDropApp = vi.fn();
    render(<Dock areas={AREAS} apps={apps} onAdd={onAdd} onDropApp={onDropApp} />);
    const add = screen.getByRole('button', { name: 'Add to Dock' });
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith(add);
    const nav = screen.getByRole('navigation');
    const dataTransfer = { types: [DOCK_DRAG_TYPE], getData: () => 'vault', dropEffect: '' };
    fireEvent.dragOver(nav, { dataTransfer, clientX: 0 });
    expect(nav.querySelector('.hl-dock-gap')).not.toBeNull();
    fireEvent.drop(nav, { dataTransfer, clientX: 0 });
    // jsdom lays nothing out, so it lands after the pinned apps.
    expect(onDropApp).toHaveBeenCalledWith('vault', 2);
    expect(nav.querySelector('.hl-dock-gap')).toBeNull();
  });

  it('US-HOME-22: a full Dock opens no gap and drops nothing', () => {
    const onDropApp = vi.fn();
    render(<Dock areas={AREAS} apps={apps} onDropApp={onDropApp} canDrop={false} />);
    const nav = screen.getByRole('navigation');
    const dataTransfer = { types: [DOCK_DRAG_TYPE], getData: () => 'vault', dropEffect: '' };
    fireEvent.dragOver(nav, { dataTransfer, clientX: 0 });
    fireEvent.drop(nav, { dataTransfer, clientX: 0 });
    expect(nav.querySelector('.hl-dock-gap')).toBeNull();
    expect(onDropApp).not.toHaveBeenCalled();
  });

  it('turns magnification off when asked', () => {
    render(<Dock areas={AREAS} magnify={false} />);
    expect(screen.getByRole('navigation')).toHaveClass('hl-dock-still');
  });

  it('shows members only the areas it is given, without Search when hidden', () => {
    render(<Dock areas={AREAS.filter((a) => ['home', 'files', 'settings'].includes(a.id))} search={false} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Home',
      'Files',
      'Settings',
    ]);
  });

  it('uses the app copy passed through UiStringsProvider', () => {
    render(
      <UiStringsProvider strings={{ dock: 'Navigation', search: 'Find' }}>
        <Dock areas={AREAS.slice(0, 1)} />
      </UiStringsProvider>,
    );
    expect(screen.getByRole('navigation', { name: 'Navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find' })).toBeInTheDocument();
  });
});

describe('TabBar (phone)', () => {
  it('marks the selected tab, reports selection and names count badges', async () => {
    const onSelect = vi.fn();
    render(
      <TabBar
        items={AREAS.map((a) => (a.id === 'store' ? { ...a, badge: 2 } : a))}
        active="home"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByRole('navigation', { name: 'Tab bar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('2 updates')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Files/ }));
    expect(onSelect).toHaveBeenCalledWith('files');
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('moves the selection when uncontrolled', async () => {
    render(<TabBar items={AREAS} defaultActive="home" />);
    await userEvent.click(screen.getByRole('button', { name: 'Usage' }));
    expect(screen.getByRole('button', { name: 'Usage' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
});
