// A folder on a phone (PhoneRedesignA_Files, US-PHONE-25): an inset grouped list, each row the item's icon (or its
// photo), its name and "24 items" or "1.2 MB · Today", and a "•••" for its actions. A tap opens; while selecting a
// tap ticks it (PhoneRedesignA_FilesSelect), and a long press starts selecting (D-137).
import type { FileEntry } from '@hlabs/api';
import { FileIcon, fileKindOf } from '@hlabs/icons/files';
import { formatBytes } from '@hlabs/shared';
import { MoreButton } from '@hlabs/ui';
import type { FileAccent } from '@hlabs/ui/files';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { labelOf, modsOf, SelectBox, thumbnailOf, type SelectProps } from './file-grid';
import { modifiedLabel } from './format';
import { consumeLongPress, longPressProps } from './long-press';

/** "24 items" under a folder; "1.2 MB · Today" under a file. */
export function phoneMetaOf(e: FileEntry, now: number): string {
  if (e.kind === 'folder') return copy.items(e.childCount ?? 0);
  const size = formatBytes(e.size ?? 0);
  return e.modifiedAt ? copy.footer(size, modifiedLabel(e.modifiedAt, now)) : size;
}

/** The item's icon at 36px, or its photo's thumbnail. */
export function PhoneItemIcon({ entry, accent, size = 36 }: { entry: FileEntry; accent: FileAccent; size?: number }) {
  const thumb = thumbnailOf(entry);
  if (thumb && entry.mime?.startsWith('image/'))
    return <img src={thumb} alt="" className="hl-p-thumb" style={{ width: size, height: size }} />;
  return entry.kind === 'folder' ? (
    <FileIcon folder path={entry.path} accent={accent} size={size} />
  ) : (
    <FileIcon kind={fileKindOf(entry.name, entry.mime)} name={entry.name} mime={entry.mime} size={size} />
  );
}

export function PhoneFileList({
  items,
  label,
  accent,
  focusPath,
  onOpen,
  select,
  onMenu,
  below,
}: {
  items: FileEntry[];
  /** The list's accessible name: the folder's name. */
  label: string;
  accent: FileAccent;
  focusPath?: string | null;
  onOpen: (entry: FileEntry) => void;
  select?: SelectProps;
  /** "•••": the item's action sheet (US-FILE-21). */
  onMenu?: (entry: FileEntry, at: null) => void;
  /** Under each name instead of its size: search shows the folder (US-FILE-04). */
  below?: (entry: FileEntry) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());
  // Focus moves to `focusPath` once, when it shows up (a new folder, a renamed file).
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
      el.focus();
      el.scrollIntoView?.({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPath, items]);

  return (
    <div ref={ref} role="group" aria-label={label} className="hl-p-group">
      {items.map((e) => {
        const checked = select?.selected.has(e.path) ?? false;
        return (
          <div
            key={e.path}
            className="hl-p-row hl-p-file"
            data-selecting={select?.selecting || undefined}
            data-checked={checked || undefined}
            {...longPressProps(select?.onLongPress && !select.selecting ? () => select.onLongPress!(e) : undefined)}
            // A long press would bring up the browser's own menu.
            onContextMenu={(ev) => ev.preventDefault()}
          >
            {select?.selecting ? (
              <SelectBox entry={e} checked={checked} onToggle={select.onToggle} className="hl-p-tick" />
            ) : null}
            <button
              type="button"
              data-path={e.path}
              aria-label={labelOf(e)}
              className="hl-p-file-open"
              onClick={(ev) => {
                if (consumeLongPress() || ev.detail > 1) return;
                if (select?.selecting) select.onSelect(e, modsOf(ev));
                else onOpen(e);
              }}
            >
              <span aria-hidden className="hl-p-file-icon">
                <PhoneItemIcon entry={e} accent={accent} />
              </span>
              <span className="hl-p-row-text">
                <span className="hl-p-row-title truncate">{e.name}</span>
                <span className="hl-p-row-sub truncate">{below ? below(e) : phoneMetaOf(e, now)}</span>
              </span>
            </button>
            {onMenu && !select?.selecting ? <MoreButton name={e.name} onClick={() => onMenu(e, null)} /> : null}
          </div>
        );
      })}
    </div>
  );
}
