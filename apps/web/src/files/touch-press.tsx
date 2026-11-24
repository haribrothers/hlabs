// Files by touch on a tablet (US-TAB-02, US-TAB-03, TabletFiles): a long press on a file or folder opens its menu at
// the finger, as a right-click does (D-175 over D-137's long press to select, which stays with a mouse); held and then
// moved, the item lifts and follows the finger, "Move to Taxes" shows over a folder that takes it, and lifting the
// finger there moves it, with Undo, as a mouse drag does (US-FILE-22). One handler for the whole grid or list.
import type { FileEntry } from '@hlabs/api';
import { FolderInput, iconDefaults } from '@hlabs/icons';
import { FileIcon, fileKindOf } from '@hlabs/icons/files';
import { tokens, useLongPress, type Point } from '@hlabs/ui';
import { useRef, useState, type PointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { filesCopy as copy } from '../copy/files';
import { canDropOn, endDrag, startTouchDrag, type DragProps } from './drag';

/** The lifted item: a little larger than a grid item's 72px icon. */
const GHOST = tokens.SIZE_APP_ICON + tokens.SPACE_1;

interface Lifted {
  entries: FileEntry[];
  from: string;
  entry: FileEntry;
  at: Point;
  over: FileEntry | null;
}

/** The folder in this view under the finger that would take the items, if any. */
function folderAt(root: HTMLElement | null, items: readonly FileEntry[], at: Point): FileEntry | null {
  if (!root) return null;
  for (const el of root.querySelectorAll<HTMLElement>('[data-path]')) {
    const r = el.getBoundingClientRect();
    if (at.x < r.left || at.x > r.right || at.y < r.top || at.y > r.bottom) continue;
    const entry = items.find((e) => e.path === el.dataset.path);
    return entry && canDropOn(entry) ? entry : null;
  }
  return null;
}

export function useFilesTouch({
  root,
  enabled,
  items,
  onMenu,
  drag,
  setOver,
}: {
  /** The grid or list: where the folders are. */
  root: RefObject<HTMLElement | null>;
  /** A tablet (data-input="touch"): nothing on a computer with a mouse or a phone. */
  enabled: boolean;
  items: readonly FileEntry[];
  onMenu?: (entry: FileEntry, at: { x: number; y: number } | null) => void;
  drag?: DragProps;
  /** Marks the folder the items would go into. */
  setOver: (path: string | null) => void;
}) {
  const down = useRef<FileEntry | null>(null);
  const [lifted, setLifted] = useState<Lifted | null>(null);
  const press = useLongPress({
    enabled,
    onLongPress: (at) => {
      if (down.current && onMenu) onMenu(down.current, at);
    },
    onDragStart: drag
      ? (at) => {
          const entry = down.current;
          if (!entry) return;
          drag.onTouchDragStart?.();
          const entries = drag.carry(entry);
          startTouchDrag(entries, drag.from);
          setLifted({ entries, from: drag.from, entry, at, over: null });
        }
      : undefined,
    onDragMove: (at) => {
      const over = folderAt(root.current, items, at);
      setOver(over?.path ?? null);
      setLifted((l) => (l ? { ...l, at, over } : l));
    },
    onDragEnd: (at, dropped) => {
      const l = lifted;
      const over = folderAt(root.current, items, at);
      setOver(null);
      setLifted(null);
      endDrag();
      if (dropped && l && over && drag) drag.onDrop(over, l.entries, l.from);
    },
  });

  const containerProps = enabled
    ? {
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          const el = (e.target as Element).closest<HTMLElement>('[data-path]');
          // Not on an item's tick or button: those are taps.
          if (!el || (e.target as Element).closest('input, button:not([data-path])')) return;
          down.current = items.find((i) => i.path === el.dataset.path) ?? null;
          if (down.current) press.onPointerDown(e);
        },
        onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => {
          // The OS's own menu never shows; ours opens from the long press.
          if (!press.onContextMenu(e)) e.preventDefault();
        },
      }
    : {};

  const dragged = new Set(lifted?.entries.map((e) => e.path) ?? []);
  const overlay = lifted
    ? createPortal(
        <>
          <span
            aria-hidden
            className="hl-touch-ghost"
            style={{ left: lifted.at.x, top: lifted.at.y, width: GHOST, height: GHOST }}
          >
            {lifted.entry.kind === 'folder' ? (
              <FileIcon folder path={lifted.entry.path} size={GHOST} />
            ) : (
              <FileIcon
                kind={fileKindOf(lifted.entry.name, lifted.entry.mime)}
                name={lifted.entry.name}
                mime={lifted.entry.mime}
                size={GHOST}
              />
            )}
          </span>
          {lifted.over ? (
            <span
              role="status"
              className="hl-touch-chip"
              style={{ left: lifted.at.x + GHOST / 2 + tokens.SPACE_2, top: lifted.at.y - GHOST / 2 }}
            >
              <FolderInput aria-hidden {...iconDefaults} className="size-4.5" />
              {copy.moveToFolder(lifted.over.name)}
            </span>
          ) : null}
          <p className="hl-touch-hint m-0">{copy.touchDragHint}</p>
        </>,
        document.body,
      )
    : null;

  return { containerProps, overlay, dragged };
}
