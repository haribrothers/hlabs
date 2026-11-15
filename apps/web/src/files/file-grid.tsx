// A folder as a grid of FileItems (US-FILE-02): folders first, then files; the arrow keys move between items, Enter
// or a double-click opens. One item takes Tab (roving focus), so the grid is one stop on the way through the window.
import type { FileEntry } from '@hlabs/api';
import { formatBytes } from '@hlabs/shared';
import { FileItem, type FileAccent } from '@hlabs/ui/files';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';

/** "24 items" under a folder, the size under a file. */
export const metaOf = (e: FileEntry) =>
  e.kind === 'folder' ? copy.items(e.childCount ?? 0) : formatBytes(e.size ?? 0);

/** The accessible name: the name plus "folder" or its size (US-FILE-02). */
export const labelOf = (e: FileEntry) =>
  e.kind === 'folder' ? copy.folderLabel(e.name) : copy.fileLabel(e.name, formatBytes(e.size ?? 0));

/** Images get a 256px thumbnail; videos their first frame (D-053). */
export const thumbnailOf = (e: FileEntry) =>
  e.previewUrl ? (e.mime?.startsWith('image/') ? `${e.previewUrl}?w=256` : e.previewUrl) : undefined;

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
}: {
  items: FileEntry[];
  /** The grid's accessible name: the folder's name. */
  label: string;
  accent: FileAccent;
  /** Focus this item once it shows (a new folder, or the file a preview closed on). */
  focusPath?: string | null;
  onOpen: (entry: FileEntry) => void;
  /** Under each name instead of the size: search shows the folder (US-FILE-04). */
  below?: (entry: FileEntry) => ReactNode;
  openOnClick?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const tabStop = items.some((e) => e.path === current) ? current : (items[0]?.path ?? null);

  useEffect(() => {
    if (!focusPath) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(focusPath)}"]`);
    if (el) {
      setCurrent(focusPath);
      el.focus();
      el.scrollIntoView?.({ block: 'nearest' });
    }
  }, [focusPath, items]);

  const onKeyDown = (e: KeyboardEvent) => {
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
      className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] justify-items-center gap-x-2 gap-y-3"
    >
      {items.map((e) => (
        <FileItem
          key={e.path}
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
          onFocus={() => setCurrent(e.path)}
          // A tap opens on a phone; on a desktop a click selects and a double-click opens.
          onClick={() => (openOnClick ? onOpen(e) : setCurrent(e.path))}
          onOpen={() => onOpen(e)}
        />
      ))}
    </div>
  );
}
