// Whether hlabs is updating (US-STATE-01), shared by the whole page: entered when the daemon says so (the
// system.status event, or /healthz answering 503 "updating"), and kept in sessionStorage so a hard refresh while the
// daemon is down (step 1) still shows "Updating hlabs" rather than "Can't reach hlabs". Storage may be unavailable
// (private windows): then it lasts until the page reloads.
import { useSyncExternalStore } from 'react';

export const UPDATING_KEY = 'hlabs.updating';
/** How often the updating page asks /healthz (US-STATE-02). */
export const UPDATE_POLL_MS = 2_000;

export interface Updating {
  /** When this page first knew (ms). */
  since: number;
}

function read(): Updating | null {
  try {
    const raw = sessionStorage.getItem(UPDATING_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Updating>) : null;
    return parsed && typeof parsed.since === 'number' ? { since: parsed.since } : null;
  } catch {
    return null;
  }
}

let current: Updating | null = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** hlabs is updating: every route gives way to the updating state. */
export function markUpdating(now = Date.now()): void {
  if (current) return;
  current = { since: now };
  try {
    sessionStorage.setItem(UPDATING_KEY, JSON.stringify(current));
  } catch {
    // Kept in memory only.
  }
  emit();
}

/** The update is over (the page is reloading, or hlabs couldn't finish it). */
export function clearUpdating(): void {
  current = null;
  try {
    sessionStorage.removeItem(UPDATING_KEY);
  } catch {
    // Nothing kept.
  }
  emit();
}

export const updatingNow = () => current;

/** For tests: read the stored flag again, as a fresh page load would. */
export function reloadUpdatingFlag(): void {
  current = read();
  emit();
}

export function useUpdating(): Updating | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
