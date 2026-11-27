// A folder as a grid of FileItems (US-FILE-02): folders first, then files; the arrow keys move between items, Enter
// or a double-click opens. One item takes Tab (roving focus), so the grid is one stop on the way through the window.
import type { FileEntry } from '@hlabs/api';
import { formatBytes } from '@hlabs/shared';
import { iconDefaults, MoreHorizontal } from '@hlabs/icons';
import { IconButton, useIsTouch } from '@hlabs/ui';
import { FileItem, type FileAccent } from '@hlabs/ui/files';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import type { ClickMods } from './selection';
import { itemDragProps, type DragProps } from './drag';
import { consumeLongPress, longPressProps } from './long-press';
import { useFilesTouch } from './touch-press';

/** "24 items" under a folder, the size under a file. */
export const metaOf = (e: FileEntry) =>
  e.kind === 'folder' ? copy.items(e.childCount ?? 0) : formatBytes(e.size ?? 0);

/** The accessible name: the name plus "folder" or its size (US-FILE-02). */
export const labelOf = (e: FileEntry) =>
  e.kind === 'folder' ? copy.folderLabel(e.name) : copy.fileLabel(e.name, formatBytes(e.size ?? 0));

/** Images get a 256px thumbnail; videos their first frame (D-053). */
export const thumbnailOf = (e: FileEntry) =>
  e.previewUrl ? (e.mime?.startsWith('image/') ? `${e.previewUrl}?w=256` : e.previewUrl) : undefined;

/** How a click asks to select (US-FILE-20): Cmd on a Mac or Ctrl elsewhere toggles, Shift selects a range. */
export const modsOf = (e: MouseEvent | KeyboardEvent): ClickMods => ({
  toggle: e.metaKey || e.ctrlKey,
  range: e.shiftKey,
});

/** Selecting in a folder (US-FILE-20); absent where items can't be selected (search results, Recents). */
export interface SelectProps {
  selected: ReadonlySet<string>;
  onSelect: (entry: FileEntry, mods: ClickMods) => void;
  onToggle: (entry: FileEntry) => void;
  onSelectAll: () => void;
  /** Select mode (D-137): every item shows its tick and a click ticks it. */
  selecting?: boolean;
  /** A long press starts selecting with this item (D-137). */
  onLongPress?: (entry: FileEntry) => void;
}

/** The tick on an item (US-FILE-20): "Select <name>". */
export function SelectBox({
  entry,
  checked,
  onToggle,
  className = '',
}: {
  entry: FileEntry;
  checked: boolean;
  onToggle: (entry: FileEntry) => void;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={copy.selectItem(entry.name)}
      checked={checked}
      onChange={() => onToggle(entry)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`hl-focus size-4.5 shrink-0 cursor-pointer accent-[var(--color-accent)] ${className}`}
    />
  );
}

/** The index of the item one row up or down: the nearest item in that row by position. */
function verticalNeighbour(items: HTMLElement[], from: number, down: boolean): number {
  const here = items[from]!.getBoundingClientRect();
  let best = -1;
  let bestScore = Infinity;
  items.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (down ? r.top <= here.top + 1 : r.top >= here.top - 1) return;
    const score = Math.abs(r.top - here.top) * 10_000 + Math.abs(r.left - here.left);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function FileGrid({
  items,
  label,
  accent,
  focusPath,
  onOpen,
  below,
  openOnClick = false,
  select,
  onRename,
  drag,
  onDeleteKey,
  onMenu,
}: {
  /** The right-click menu at a point, or a phone's "•••" (null) (US-FILE-21). */
  onMenu?: (entry: FileEntry, at: { x: number; y: number } | null) => void;
  /** Delete or Backspace on the focused item (US-FILE-16). */
  onDeleteKey?: (entry: FileEntry) => void;
  /** Dragging items onto folders moves them (US-FILE-22); desktop only. */
  drag?: DragProps;
  /** F2 on the focused item (US-FILE-23); absent where it can't be renamed. */
  onRename?: (entry: FileEntry) => void;
  select?: SelectProps;
  items: FileEntry[];
  /** The grid's accessible name: the folder's name. */
  label: string;
  accent: FileAccent;
  /** Focus this item once it shows (a new folder, or the file a preview closed on). */
  focusPath?: string | null;
  onOpen: (entry: FileEntry) => void;
  /** Under each name instead of the size: search shows the folder (US-FILE-04). */
  below?: (entry: FileEntry) => ReactNode;
  /** A phone: "•••" on each item instead of the right-click menu, and no dragging. */
  openOnClick?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const tabStop = items.some((e) => e.path === current) ? current : (items[0]?.path ?? null);
  // A tablet: a long press opens the menu and a held item moves by finger (US-TAB-02, US-TAB-03).
  const touch = useIsTouch() && !openOnClick;
  const finger = useFilesTouch({ root: ref, enabled: touch, items, onMenu, drag, setOver });

  // Focus moves to `focusPath` once, when it shows up: a later reload of the list (an upload, an Undo) mustn't pull it
  // back from wherever the person has moved it since.
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusPath) {
      focused.current = null;
      return;
    }
    if (focused.current === focusPath) return;
    // A frame later: a dialog that just closed (New folder, a preview) gives focus back to what opened it first.
    const frame = requestAnimationFrame(() => {
      const el = ref.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(focusPath)}"]`);
      if (!el) return;
      focused.current = focusPath;
      setCurrent(focusPath);
      el.focus();
      el.scrollIntoView?.({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPath, items]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (onMenu && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) {
      const el = document.activeElement as HTMLElement | null;
      const entry = items.find((i) => i.path === el?.dataset.path);
      if (entry && el) {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        onMenu(entry, { x: r.left + r.width / 2, y: r.bottom });
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && onDeleteKey) {
      const path = (document.activeElement as HTMLElement | null)?.dataset.path;
      const entry = items.find((i) => i.path === path);
      if (entry) {
        e.preventDefault();
        onDeleteKey(entry);
      }
      return;
    }
    if (e.key === 'F2' && onRename) {
      const path = (document.activeElement as HTMLElement | null)?.dataset.path;
      const entry = items.find((i) => i.path === path);
      if (entry) {
        e.preventDefault();
        onRename(entry);
      }
      return;
    }
    if (e.key === 'Enter' || (e.key === ' ' && select?.selecting)) {
      const from = (e.target as HTMLElement).closest<HTMLElement>('[data-path]');
      const entry = items.find((i) => i.path === from?.dataset.path);
      if (!entry) return;
      e.preventDefault();
      if (select?.selecting) select.onSelect(entry, modsOf(e));
      else onOpen(entry);
      return;
    }
    if (select && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      select.onSelectAll();
      return;
    }
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('[data-path]') ?? [])];
    const at = els.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    let next: number;
    if (e.key === 'ArrowLeft') next = at - 1;
    else if (e.key === 'ArrowRight') next = at + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = els.length - 1;
    else next = verticalNeighbour(els, at, e.key === 'ArrowDown');
    const el = els[next];
    if (!el) return;
    e.preventDefault();
    el.focus();
    setCurrent(el.dataset.path ?? null);
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      onPointerDown={finger.containerProps.onPointerDown}
      onContextMenu={finger.containerProps.onContextMenu}
      className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] justify-items-center gap-x-2 gap-y-3"
    >
      {items.map((e) => {
        const checked = select?.selected.has(e.path) ?? false;
        return (
          <div
            key={e.path}
            className={`group relative rounded-lg ${over === e.path ? 'bg-accent-wash ring-2 ring-accent' : ''} ${
              finger.dragged.has(e.path) ? 'opacity-35' : ''
            }`}
            {...itemDragProps(e, touch ? undefined : drag, setOver)}
            {...longPressProps(
              select?.onLongPress && !select.selecting && !touch ? () => select.onLongPress!(e) : undefined,
            )}
          >
            <FileItem
              name={e.name}
              kind={e.kind === 'folder' ? 'folder' : undefined}
              mime={e.mime}
              path={e.path}
              accent={accent}
              meta={below ? below(e) : metaOf(e)}
              thumbnail={thumbnailOf(e)}
              label={labelOf(e)}
              dataPath={e.path}
              tabIndex={e.path === tabStop ? 0 : -1}
              selected={checked}
              onFocus={() => setCurrent(e.path)}
              // A click opens (D-137); while selecting it ticks. Enter is handled by the grid.
              onClick={(ev) => {
                setCurrent(e.path);
                if (consumeLongPress() || ev.detail > 1) return;
                if (select?.selecting) select.onSelect(e, modsOf(ev));
                else onOpen(e);
              }}
              onContextMenu={(ev) => {
                // A phone's long press would bring up the browser's own menu.
                if (openOnClick) return ev.preventDefault();
                if (!onMenu) return;
                ev.preventDefault();
                onMenu(e, { x: ev.clientX, y: ev.clientY });
              }}
            />
            {select?.selecting ? (
              <SelectBox entry={e} checked={checked} onToggle={select.onToggle} className="absolute top-3 left-3" />
            ) : null}
            {onMenu && openOnClick && !select?.selecting ? (
              <IconButton
                label={copy.moreFor(e.name)}
                className="absolute top-0.5 right-0.5 bg-transparent"
                onClick={() => onMenu(e, null)}
              >
                <MoreHorizontal aria-hidden {...iconDefaults} />
              </IconButton>
            ) : null}
          </div>
        );
      })}
      {finger.overlay}
    </div>
  );
}
