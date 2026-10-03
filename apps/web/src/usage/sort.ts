// How the per-app table is sorted (US-USE-06): Memory, most first, unless this browser chose another before. A new
// column sorts most first (App and Status A–Z first); the same column again flips it. Kept in local storage, which
// may be unavailable (private windows): then it's just the default each time.
import { useCallback, useState } from 'react';

export type SortColumn = 'app' | 'cpu' | 'memory' | 'network' | 'status';
export type SortDir = 'asc' | 'desc';
export interface Sort {
  column: SortColumn;
  dir: SortDir;
}

export const SORT_KEY = 'hlabs.usage.sort';
export const DEFAULT_SORT: Sort = { column: 'memory', dir: 'desc' };
const COLUMNS: readonly SortColumn[] = ['app', 'cpu', 'memory', 'network', 'status'];
/** Words sort A–Z first; numbers most first. */
const firstDir = (column: SortColumn): SortDir => (column === 'app' || column === 'status' ? 'asc' : 'desc');

function read(): Sort {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null') as Partial<Sort> | null;
    if (saved && COLUMNS.includes(saved.column!) && (saved.dir === 'asc' || saved.dir === 'desc')) {
      return { column: saved.column!, dir: saved.dir };
    }
  } catch {
    // Unreadable: the default.
  }
  return DEFAULT_SORT;
}

export function useTableSort(): [Sort, (column: SortColumn) => void] {
  const [sort, setSort] = useState<Sort>(read);
  const choose = useCallback((column: SortColumn) => {
    setSort((current) => {
      const next: Sort =
        current.column === column
          ? { column, dir: current.dir === 'asc' ? 'desc' : 'asc' }
          : { column, dir: firstDir(column) };
      try {
        localStorage.setItem(SORT_KEY, JSON.stringify(next));
      } catch {
        // Not remembered; nothing else changes.
      }
      return next;
    });
  }, []);
  return [sort, choose];
}
