// Grid or list, and the sort (US-FILE-19): kept per browser in localStorage, so they're the same in every folder and
// after a reload. Storage that's blocked or full is ignored: the defaults apply.
import { useCallback, useState } from 'react';

export type FilesView = 'grid' | 'list';
export type SortBy = 'name' | 'modified' | 'size';
export type SortDir = 'asc' | 'desc';
export interface FilesSort {
  by: SortBy;
  dir: SortDir;
}

export const VIEW_KEY = 'hlabs.files.view';
export const SORT_KEY = 'hlabs.files.sort';
export const DEFAULT_SORT: FilesSort = { by: 'name', dir: 'asc' };
/** A column clicked for the first time: names A to Z, newest first, biggest first. */
export const FIRST_DIR: Record<SortBy, SortDir> = { name: 'asc', modified: 'desc', size: 'desc' };

function read<T>(key: string, valid: (v: unknown) => v is T, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    const v: unknown = raw === null ? null : JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not kept: it still applies until the page closes.
  }
}

const isView = (v: unknown): v is FilesView => v === 'grid' || v === 'list';
const isSort = (v: unknown): v is FilesSort =>
  typeof v === 'object' &&
  v !== null &&
  ['name', 'modified', 'size'].includes((v as FilesSort).by) &&
  ['asc', 'desc'].includes((v as FilesSort).dir);

/** The next sort after clicking a column: the same column turns around, another starts its own way. */
export function nextSort(current: FilesSort, by: SortBy): FilesSort {
  if (current.by === by) return { by, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { by, dir: FIRST_DIR[by] };
}

export function useFilesView() {
  const [view, setViewState] = useState<FilesView>(() => read(VIEW_KEY, isView, 'grid'));
  const [sort, setSortState] = useState<FilesSort>(() => read(SORT_KEY, isSort, DEFAULT_SORT));
  const setView = useCallback((v: FilesView) => {
    setViewState(v);
    write(VIEW_KEY, v);
  }, []);
  const sortBy = useCallback((by: SortBy) => {
    setSortState((s) => {
      const next = nextSort(s, by);
      write(SORT_KEY, next);
      return next;
    });
  }, []);
  return { view, setView, sort, sortBy };
}
