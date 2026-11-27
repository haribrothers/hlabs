// Whether hlabs is restarting (US-SYS-31) or being reset (US-SYS-38), shared by the whole page as `updating.ts` is for
// updates: entered when this page asked for it, when the daemon says so (`system.status`) or /healthz answers
// `restarting` / `resetting`, and kept in sessionStorage so a reload while hlabs is away still shows it. For a reset
// it also keeps the setup token the reset gave this browser, to open onboarding with once hlabs is back.
import { useSyncExternalStore } from 'react';

export const RESTARTING_KEY = 'hlabs.restarting';
/** How often the full-screen state asks /healthz. */
export const RESTART_POLL_MS = 2_000;
/** Not back within this: "Can't reach hlabs" (US-SYS-31). */
export const RESTART_GIVE_UP_MS = 2 * 60_000;
/** A reset deletes every app's data first, so it gets longer before it counts as stuck. */
export const RESET_GIVE_UP_MS = 15 * 60_000;

export interface Restarting {
  kind: 'restarting' | 'resetting';
  /** When this page first knew (ms). */
  since: number;
  /** The next onboarding's setup token (a reset this browser asked for). */
  setupToken: string | null;
}

function read(): Restarting | null {
  try {
    const raw = sessionStorage.getItem(RESTARTING_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Restarting>) : null;
    return p && (p.kind === 'restarting' || p.kind === 'resetting') && typeof p.since === 'number'
      ? { kind: p.kind, since: p.since, setupToken: typeof p.setupToken === 'string' ? p.setupToken : null }
      : null;
  } catch {
    return null;
  }
}

let current: Restarting | null = read();
/** This page has asked for a reset and is waiting for the answer: a `session.revoked` now is the reset's own. */
let resetAsked = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function save(next: Restarting | null) {
  current = next;
  try {
    if (next) sessionStorage.setItem(RESTARTING_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(RESTARTING_KEY);
  } catch {
    // Kept in memory only.
  }
  emit();
}

/** hlabs is restarting: every route gives way to "Restarting hlabs…". */
export function markRestarting(now = Date.now()): void {
  if (current) return;
  save({ kind: 'restarting', since: now, setupToken: null });
}

/** hlabs is being reset; this browser keeps the setup token it was given, if any. */
export function markResetting(setupToken: string | null = null, now = Date.now()): void {
  resetAsked = false;
  if (current?.kind === 'resetting') {
    if (setupToken && !current.setupToken) save({ ...current, setupToken });
    return;
  }
  save({ kind: 'resetting', since: now, setupToken });
}

/** This page is asking for a reset (until it answers, or fails). */
export function setResetAsked(asked: boolean): void {
  resetAsked = asked;
}

/** A reset is under way or being asked for: signing out now is part of it, not a reason to go to log in. */
export const resetUnderway = () => resetAsked || current?.kind === 'resetting';

export function clearRestarting(): void {
  save(null);
}

export const restartingNow = () => current;

/** For tests: read the stored flag again, as a fresh page load would. */
export function reloadRestartingFlag(): void {
  current = read();
  resetAsked = false;
  emit();
}

export function useRestarting(): Restarting | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
