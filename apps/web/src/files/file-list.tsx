// A folder as a list (US-FILE-19, FilesList): Name, Modified and Size, folders first with their item count as the
// size. Clicking a column header sorts by it and clicking again turns it around; the active one shows an arrow and
// says its order to screen readers. Rows take one Tab stop; the arrow keys move, Enter or a double-click opens.
import type { FileEntry } from '@hlabs/api';
import { ArrowDown, ArrowUp, iconDefaults, MoreHorizontal } from '@hlabs/icons';
import { IconButton, useIsTouch } from '@hlabs/ui';
import { FileIcon, fileKindOf } from '@hlabs/icons/files';
import { formatBytes } from '@hlabs/shared';
import type { FileAccent } from '@hlabs/ui/files';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { labelOf, modsOf, SelectBox, type SelectProps } from './file-grid';
import { modifiedLabel } from './format';
import { itemDragProps, type DragProps } from './drag';
import { consumeLongPress, longPressProps } from './long-press';
import { useFilesTouch } from './touch-press';
import type { FilesSort, SortBy } from './view-prefs';

const COLUMNS = 'grid-cols-[28px_minmax(0,1fr)_160px_110px] max-md:grid-cols-[28px_minmax(0,1fr)_88px]';

export const sizeOf = (e: FileEntry) =>
  e.kind === 'folder' ? copy.items(e.childCount ?? 0) : formatBytes(e.size ?? 0);

function Header({
  by,
  label,
  sort,
  onSort,
  className,
}: {
  by: SortBy;
  label: string;
  sort: FilesSort;
  onSort: (by: SortBy) => void;
  className?: string;
}) {
  const active = sort.by === by;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <div
      role="columnheader"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <button
        type="button"
        className="hl-focus inline-flex items-center gap-1 rounded-xs border-0 bg-transparent p-0 text-caption font-semibold text-ink-muted hover:text-ink"
        onClick={() => onSort(by)}
      >
        {label}
        {active ? <Arrow aria-hidden {...iconDefaults} className="size-3" /> : null}
      </button>
    </div>
  );
}

export function FileList({
  items,
  label,
  accent,
  sort,
  onSort,
  focusPath,
  onOpen,
  openOnClick = false,
  now,
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
  /** Dragging rows onto folders moves them (US-FILE-22); desktop only. */
  drag?: DragProps;
  /** F2 on the focused row (US-FILE-23). */
  onRename?: (entry: FileEntry) => void;
  select?: SelectProps;
  items: FileEntry[];
  label: string;
  accent: FileAccent;
  sort: FilesSort;
  onSort: (by: SortBy) => void;
  focusPath?: string | null;
  onOpen: (entry: FileEntry) => void;
  openOnClick?: boolean;
  /** "Today" is worked out from this (tests); otherwise from when the list was shown. */
  now?: number;
}) {
  const [shownAt] = useState(() => Date.now());
  const today = now ?? shownAt;
  const ref = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // A tablet: a long press opens the menu and a held row moves by finger (US-TAB-02, US-TAB-03).
  const touch = useIsTouch() && !openOnClick;
  const finger = useFilesTouch({ root: ref, enabled: touch, items, onMenu, drag, setOver });
  const tabStop = items.some((e) => e.path === current) ? current : (items[0]?.path ?? null);

  // Focus moves to `focusPath` once, when it shows up: a later reload of the list (an upload, an Undo) mustn't pull it
  // back from wherever the person has moved it since.
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focusPath) {
      focused.current = null;
      return;
    }
    if (focused.current === focusPath) return;
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

  const onKeyDown = (e: KeyboardEvent, entry: FileEntry) => {
    if (select && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      select.onSelectAll();
      return;
    }
    if (onMenu && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onMenu(entry, { x: r.left + 40, y: r.bottom });
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && onDeleteKey) {
      e.preventDefault();
      onDeleteKey(entry);
      return;
    }
    if (e.key === 'F2' && onRename) {
      e.preventDefault();
      onRename(entry);
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && select?.selecting) {
      e.preventDefault();
      select.onSelect(entry, modsOf(e));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onOpen(entry);
      return;
    }
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('[data-path]') ?? [])];
    const at = els.indexOf(e.currentTarget as HTMLElement);
    const next =
      e.key === 'ArrowDown'
        ? at + 1
        : e.key === 'ArrowUp'
          ? at - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? els.length - 1
              : -2;
    const el = els[next];
    if (!el) return;
    e.preventDefault();
    el.focus();
    setCurrent(el.dataset.path ?? null);
  };

  return (
    <div
      ref={ref}
      role="grid"
      aria-label={label}
      className="overflow-hidden rounded-lg bg-surface-row text-body"
      onPointerDown={finger.containerProps.onPointerDown}
      onContextMenu={finger.containerProps.onContextMenu}
    >
      <div role="row" className={`grid ${COLUMNS} items-center gap-3 border-b border-hairline px-4 py-2.5`}>
        <span />
        <Header by="name" label={copy.columns.name} sort={sort} onSort={onSort} />
        <Header by="modified" label={copy.columns.modified} sort={sort} onSort={onSort} className="max-md:hidden" />
        <Header by="size" label={copy.columns.size} sort={sort} onSort={onSort} className="justify-self-end" />
      </div>
      {items.map((e): ReactNode => {
        const isFolder = e.kind === 'folder';
        const checked = select?.selected.has(e.path) ?? false;
        return (
          <div
            key={e.path}
            role="row"
            aria-label={labelOf(e)}
            data-path={e.path}
            aria-selected={select ? checked : undefined}
            tabIndex={e.path === tabStop ? 0 : -1}
            className={`hl-focus grid ${COLUMNS} min-h-11 cursor-default items-center gap-3 px-4 py-2 outline-offset-[-2px] ${
              checked || over === e.path ? 'bg-accent-wash' : 'hover:bg-surface-row'
            } ${over === e.path ? 'ring-2 ring-accent ring-inset' : ''} ${finger.dragged.has(e.path) ? 'opacity-35' : ''}`}
            {...itemDragProps(e, touch ? undefined : drag, setOver)}
            {...longPressProps(
              select?.onLongPress && !select.selecting && !touch ? () => select.onLongPress!(e) : undefined,
            )}
            onFocus={() => setCurrent(e.path)}
            // A click opens (D-137); while selecting it ticks.
            onClick={(ev) => {
              setCurrent(e.path);
              if (consumeLongPress() || ev.detail > 1) return;
              if (select?.selecting) select.onSelect(e, modsOf(ev));
              else onOpen(e);
            }}
            onContextMenu={(ev) => {
              if (openOnClick) return ev.preventDefault();
              if (!onMenu) return;
              ev.preventDefault();
              onMenu(e, { x: ev.clientX, y: ev.clientY });
            }}
            onKeyDown={(ev) => onKeyDown(ev, e)}
          >
            <div role="gridcell" className="flex items-center">
              {select?.selecting ? <SelectBox entry={e} checked={checked} onToggle={select.onToggle} /> : null}
            </div>
            <div role="gridcell" className="flex min-w-0 items-center gap-3">
              {isFolder ? (
                <FileIcon folder path={e.path} accent={accent} size={24} />
              ) : (
                <FileIcon kind={fileKindOf(e.name, e.mime)} name={e.name} mime={e.mime} size={24} />
              )}
              <span className="truncate" title={e.name}>
                {e.name}
              </span>
            </div>
            <div role="gridcell" className="text-ink-muted max-md:hidden">
              {modifiedLabel(e.modifiedAt, today)}
            </div>
            <div role="gridcell" className="flex items-center justify-self-end gap-1 text-ink-muted">
              {sizeOf(e)}
              {onMenu && openOnClick && !select?.selecting ? (
                <IconButton
                  label={copy.moreFor(e.name)}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onMenu(e, null);
                  }}
                >
                  <MoreHorizontal aria-hidden {...iconDefaults} />
                </IconButton>
              ) : null}
            </div>
          </div>
        );
      })}
      {finger.overlay}
    </div>
  );
}
