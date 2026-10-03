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
  /** The version the page was loaded with; null when it never heard (opened during the update). */
  fromVersion: string | null;
}

/** After the reload (US-STATE-02, US-STATE-03): which version the update came from and which answered. */
export const RESULT_KEY = 'hlabs.updateResult';
/** Versions this browser session has already said "hlabs is up to date" for (once per session). */
export const TOASTED_KEY = 'hlabs.updateToasted';

let knownVersion: string | null = null;
/** The version hlabs answered with while all was well, for after an update. */
export function noteVersion(version: string): void {
  knownVersion = version;
}

function read(): Updating | null {
  try {
    const raw = sessionStorage.getItem(UPDATING_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Updating>) : null;
    return parsed && typeof parsed.since === 'number'
      ? { since: parsed.since, fromVersion: typeof parsed.fromVersion === 'string' ? parsed.fromVersion : null }
      : null;
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
  current = { since: now, fromVersion: knownVersion };
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

const storage = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // Not kept; the page still reloads.
    }
  },
  remove(key: string): void {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing kept.
    }
  },
};

export interface UpdateResult {
  from: string | null;
  to: string;
}

/** hlabs is back on `to`: keep what happened for after the reload, and stop updating. */
export function finishUpdating(to: string): void {
  storage.set(RESULT_KEY, JSON.stringify({ from: current?.fromVersion ?? null, to } satisfies UpdateResult));
  clearUpdating();
}

/** What the update before this load did, once (it's removed as it's read). */
export function takeUpdateResult(): UpdateResult | null {
  const raw = storage.get(RESULT_KEY);
  storage.remove(RESULT_KEY);
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<UpdateResult>) : null;
    return parsed && typeof parsed.to === 'string'
      ? { from: typeof parsed.from === 'string' ? parsed.from : null, to: parsed.to }
      : null;
  } catch {
    return null;
  }
}

/** Whether this browser session has said "hlabs is up to date" for `version` yet; remembers that it now has. */
export function firstToastFor(version: string): boolean {
  let seen: string[];
  try {
    seen = JSON.parse(storage.get(TOASTED_KEY) ?? '[]') as string[];
  } catch {
    seen = [];
  }
  if (seen.includes(version)) return false;
  storage.set(TOASTED_KEY, JSON.stringify([...seen, version]));
  return true;
}
