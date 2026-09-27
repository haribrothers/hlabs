import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dock, TabBar, UiStringsProvider, type AreaItem } from '../src/index';

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
    { id: 'immich', name: 'Immich', logo: '/logo.svg', open: true },
    { id: 'jellyfin', name: 'Jellyfin', colors: ['#000000', '#111111'] as const, badge: 3 },
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
    expect(screen.getByLabelText('2 new')).toBeInTheDocument();
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
