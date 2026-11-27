// US-TAB-03 · Drag by touch: a file held and moved closes its menu, follows the finger with "Move to Taxes" over a
// folder that takes it, and moves there when the finger lifts (as a mouse drag does, US-FILE-22); lifted elsewhere it
// stays. A pinned Dock app held and moved goes along the Dock and drops where the finger lifts (US-HOME-22). Home's edit
// mode drags with dnd-kit's touch sensor (a hold, then the finger) and was already touch-ready; e2e/us-tab-03.spec.ts
// drives all three with real touch events.
import type { FileEntry } from '@hlabs/api';
import { Dock } from '@hlabs/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finger, place, tabletViewport } from '../test/tablet';
import { FileGrid } from './file-grid';

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
const file = (name: string, kind: 'file' | 'folder' = 'file') =>
  ({ name, path: `/home/Documents/${name}`, kind, size: 5, childCount: 1 }) as FileEntry;

let restore: () => void;
beforeEach(() => {
  restore = tabletViewport();
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

function grid() {
  const items = [file('Taxes', 'folder'), file('Work', 'folder'), file('note.txt')];
  const onDrop = vi.fn();
  const onTouchDragStart = vi.fn();
  const onMenu = vi.fn();
  render(
    <FileGrid
      items={items}
      label="Documents"
      accent="violet"
      onOpen={() => {}}
      onMenu={onMenu}
      drag={{ carry: (e) => [e], from: '/home/Documents', onDrop, onTouchDragStart }}
    />,
  );
  // A row of three 140px items.
  items.forEach((e, i) =>
    place(document.querySelector(`[data-path="${e.path}"]`)!, { x: i * 140, y: 0, width: 132, height: 140 }),
  );
  return { items, onDrop, onTouchDragStart, onMenu };
}

describe('US-TAB-03', () => {
  it('a held file moved onto a folder goes there when the finger lifts, the menu closing as it moves', async () => {
    const { items, onDrop, onTouchDragStart, onMenu } = grid();
    const note = document.querySelector('[data-path="/home/Documents/note.txt"]')!;
    fireEvent.pointerDown(note, finger(350, 70));
    await wait(550);
    expect(onMenu).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(note, finger(300, 70));
    expect(onTouchDragStart).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Lift your finger on a folder to move it there')).toBeInTheDocument();
    fireEvent.pointerMove(note, finger(60, 70));
    expect(screen.getByRole('status')).toHaveTextContent('Move to Taxes');
    fireEvent.pointerUp(note, finger(60, 70));
    expect(onDrop).toHaveBeenCalledWith(items[0], [items[2]], '/home/Documents');
    expect(screen.queryByText('Lift your finger on a folder to move it there')).toBeNull();
  });

  it('lifted where no folder is, the file stays; a folder never takes itself', async () => {
    const { onDrop } = grid();
    const note = document.querySelector('[data-path="/home/Documents/note.txt"]')!;
    fireEvent.pointerDown(note, finger(350, 70));
    await wait(550);
    fireEvent.pointerMove(note, finger(350, 400));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.pointerUp(note, finger(350, 400));
    const taxes = document.querySelector('[data-path="/home/Documents/Taxes"]')!;
    fireEvent.pointerDown(taxes, finger(60, 70));
    await wait(550);
    fireEvent.pointerMove(taxes, finger(75, 90));
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.pointerUp(taxes, finger(75, 90));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('a pinned Dock app held and moved drops where the finger lifts; its menu closes as it moves', async () => {
    const onMoveApp = vi.fn();
    const onAppMenu = vi.fn();
    const onAppMenuClose = vi.fn();
    render(
      <Dock
        areas={[{ id: 'home', label: 'Home' }]}
        apps={['A', 'B', 'C'].map((n) => ({ id: n.toLowerCase(), name: `Pin ${n}`, pinned: true }))}
        onMoveApp={onMoveApp}
        onAppMenu={onAppMenu}
        onAppMenuClose={onAppMenuClose}
        search={false}
      />,
    );
    const nav = screen.getByRole('navigation', { name: 'Dock' });
    place(nav, { x: 0, y: 700, width: 400, height: 80 });
    const pins = [...nav.querySelectorAll('[data-pinned]')];
    pins.forEach((el, i) => place(el, { x: 100 + i * 60, y: 710, width: 56, height: 56 }));
    const a = screen.getByRole('button', { name: 'Pin A' });
    expect(a).toHaveAttribute('draggable', 'false');
    fireEvent.pointerDown(a, finger(128, 738));
    await wait(550);
    expect(onAppMenu).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(a, finger(180, 738));
    expect(onAppMenuClose).toHaveBeenCalledTimes(1);
    expect(a).toHaveAttribute('data-dragging');
    fireEvent.pointerMove(a, finger(265, 738));
    fireEvent.pointerUp(a, finger(265, 738));
    // Past C: last of the three.
    expect(onMoveApp).toHaveBeenCalledWith('a', 2);
    expect(a).not.toHaveAttribute('data-dragging');
  });
});
