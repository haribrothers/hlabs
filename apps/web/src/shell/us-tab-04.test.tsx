// US-TAB-04 · The Dock on a touch screen: no magnification; a long press shows an area's name (and opens nothing),
// a pinned app's opens its menu; a tap opens at once; the Dock clears the home indicator and keeps 44px tiles.
import { Dock } from '@hlabs/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finger, tabletViewport } from '../test/tablet';

const css = readFileSync(resolve(__dirname, '../../../../packages/ui/src/styles/tablet.css'), 'utf8');
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

function dock(props: Partial<Parameters<typeof Dock>[0]> = {}) {
  const onSelect = vi.fn();
  const onOpenApp = vi.fn();
  const onAppMenu = vi.fn();
  render(
    <Dock
      areas={[
        { id: 'home', label: 'Home' },
        { id: 'files', label: 'Files' },
      ]}
      active="home"
      onSelect={onSelect}
      apps={[{ id: 'jellyfin', name: 'Jellyfin', pinned: true }]}
      onOpenApp={onOpenApp}
      onAppMenu={onAppMenu}
      search={false}
      {...props}
    />,
  );
  return { onSelect, onOpenApp, onAppMenu };
}

let restore: () => void;
beforeEach(() => {
  restore = tabletViewport();
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('US-TAB-04', () => {
  it('no magnification on a touch screen', () => {
    dock();
    expect(screen.getByRole('navigation', { name: 'Dock' })).toHaveClass('hl-dock-still');
    expect(css).toMatch(/\[data-input='touch'\] \.hl-dock \.hl-dock-tile \{\s*transform: none !important/);
  });

  it("a long press shows an area's name while the finger rests, and opens nothing", async () => {
    const { onSelect } = dock();
    const files = screen.getByRole('button', { name: 'Files' });
    fireEvent.pointerDown(files, finger(30, 30));
    await wait(550);
    expect(files).toHaveAttribute('data-held');
    fireEvent.pointerUp(files, finger(30, 30));
    expect(files).not.toHaveAttribute('data-held');
    fireEvent.click(files, { clientX: 30, clientY: 30 });
    expect(onSelect).not.toHaveBeenCalled();
    // The name is shown by the held state, not by a tap's left-over hover.
    expect(css).toMatch(/\[data-input='touch'\] \.hl-dock-item\[data-held\] \.hl-dock-tip \{\s*opacity: 1/);
    expect(css).toMatch(/\[data-input='touch'\] \.hl-dock-item:hover \.hl-dock-tip \{\s*opacity: 0/);
  });

  it("a pinned app's long press opens its menu; a tap opens the area or app at once", async () => {
    const { onSelect, onOpenApp, onAppMenu } = dock();
    const app = screen.getByRole('button', { name: 'Jellyfin' });
    fireEvent.pointerDown(app, finger(80, 30));
    await wait(550);
    expect(onAppMenu).toHaveBeenCalledWith('jellyfin', app);
    expect(app).not.toHaveAttribute('data-held');
    fireEvent.pointerUp(app, finger(80, 30));
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(onSelect).toHaveBeenCalledWith('files');
    fireEvent.click(app);
    expect(onOpenApp).toHaveBeenCalledWith('jellyfin');
  });

  it('the Dock clears the home indicator, 28px off the edge in a browser; tiles stay 44px or more', () => {
    expect(css).toMatch(
      /--hl-dock-edge: max\(var\(--size-dock-edge-touch\), calc\(var\(--space-4\) \+ env\(safe-area-inset-bottom\)\)\)/,
    );
    expect(css).toMatch(/\[data-input='touch'\] \.hl-nav-desktop \{\s*bottom: var\(--hl-dock-edge\)/);
    const tokens = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/design/tokens.json'), 'utf8')) as {
      size: { tokens: Array<{ name: string; value: string }> };
    };
    const size = (n: string) => parseInt(tokens.size.tokens.find((t) => t.name === n)!.value, 10);
    expect(size('size-dock-edge-touch')).toBe(28);
    // Area tiles are 56px; pinned apps 48px below 1280px: both over 44.
    expect(size('size-dock-tile')).toBeGreaterThanOrEqual(44);
  });
});
