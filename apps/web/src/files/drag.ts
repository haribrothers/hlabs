// Dragging items onto a folder or a sidebar place moves them there (US-FILE-22). The browser only carries a marker;
// which items and from where stay here while the drag lasts.
import type { FileEntry } from '@hlabs/api';
import type { DragEvent } from 'react';

export const ITEMS_TYPE = 'application/x-hlabs-files';

let current: { entries: FileEntry[]; from: string } | null = null;

export function startDrag(e: DragEvent, entries: FileEntry[], from: string) {
  current = { entries, from };
  e.dataTransfer.setData(ITEMS_TYPE, String(entries.length));
  e.dataTransfer.effectAllowed = 'move';
}

/** A finger's drag (US-TAB-03): the same items, without the browser's drag. */
export function startTouchDrag(entries: FileEntry[], from: string) {
  current = { entries, from };
}

export const endDrag = () => {
  current = null;
};

/** What's being dragged, when it's items from Files (not files from the computer). */
export const dragged = () => current;

export const isItemDrag = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes(ITEMS_TYPE);

/** What a folder tile or row needs to start drags and take drops. */
export interface DragProps {
  /** The items a drag from `entry` carries: the selection when it's selected, else just it. */
  carry: (entry: FileEntry) => FileEntry[];
  from: string;
  /** Items dropped on a folder in this view. */
  onDrop: (folder: FileEntry, entries: FileEntry[], from: string) => void;
  /** A finger that held an item (its menu open) starts moving it: close the menu (US-TAB-03). */
  onTouchDragStart?: () => void;
}

/** A folder takes a drop unless it's being dragged itself, or is inside one being dragged. */
export function canDropOn(folder: FileEntry): boolean {
  if (folder.kind !== 'folder' || !current) return false;
  return !current.entries.some((e) => folder.path === e.path || folder.path.startsWith(`${e.path}/`));
}

/** The handlers that make an item draggable and, for a folder, a drop target; `setOver` marks the folder under it. */
export function itemDragProps(
  entry: FileEntry,
  drag: DragProps | undefined,
  setOver: (path: string | null) => void,
): Record<string, unknown> {
  if (!drag) return {};
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => startDrag(e, drag.carry(entry), drag.from),
    onDragEnd: endDrag,
    ...(entry.kind === 'folder'
      ? {
          onDragOver: (e: DragEvent) => {
            if (!isItemDrag(e) || !canDropOn(entry)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOver(entry.path);
          },
          onDragLeave: (e: DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
          },
          onDrop: (e: DragEvent) => {
            if (!isItemDrag(e)) return;
            e.preventDefault();
            setOver(null);
            const d = dragged();
            if (d && canDropOn(entry)) drag.onDrop(entry, d.entries, d.from);
            endDrag();
          },
        }
      : {}),
  };
}
