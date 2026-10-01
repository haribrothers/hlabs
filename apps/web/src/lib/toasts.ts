// Toasts (US-STATE-14): success and neutral leave after 5 s, warning after 10 s, danger stays until dismissed.
// Hovering or focusing a toast pauses its timer until both have gone. Leaving toasts stay a moment for their exit
// animation (none with Reduce motion). At most 3 show, newest on top; older ones wait with their timers held and
// appear as others leave; danger ones are never dropped from the wait (US-STATE-16). A toast with a `key` that's
// already showing is updated instead of stacking. The first user was US-AUTH-09's "Recovery code used" (D-063).
import type { Severity } from '@hlabs/api';
import type { Feature, ToastMutation } from '@hlabs/shared';
import type { ToastTone } from '@hlabs/ui';
import { useSyncExternalStore } from 'react';

export type { ToastTone };

/** A notification's severity as a toast tone. */
export const SEVERITY_TONE: Record<Severity, ToastTone> = {
  success: 'success',
  info: 'neutral',
  warning: 'warning',
  critical: 'danger',
};

/** A toast's button (US-STATE-15), verb first: go somewhere in the dashboard, or run an allow-listed mutation. */
export type ToastAction =
  | {
      kind: 'navigate';
      label: string;
      to: string;
      /** Hidden from members. */
      admin?: boolean;
      /** Hidden until the phase that delivers it ships (D-036). */
      feature?: Feature;
    }
  | {
      /** Tries something in this page again (a download, US-APP-10); never from a notification. */
      kind: 'retry';
      label: string;
      run: () => void;
    }
  | {
      kind: 'mutation';
      label: string;
      procedure: ToastMutation;
      input: Record<string, unknown>;
      /** The success toast that replaces this one; a line per procedure otherwise. */
      done?: string;
    };

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  /** At most two are shown. */
  actions?: readonly ToastAction[];
  /** On its way out (exit animation). */
  leaving?: boolean;
  /** From a notification: dismissing it marks that read. */
  notificationId?: string;
  /** Repeats with the same key (notification kind and target) update this toast. */
  key?: string;
}

/** How many show at once; more wait. */
export const VISIBLE_TOASTS = 3;
/** How many may wait; beyond that the oldest non-danger ones are dropped. */
export const QUEUED_TOASTS = 10;

export const TOAST_MS: Record<ToastTone, number | null> = {
  success: 5000,
  neutral: 5000,
  warning: 10_000,
  danger: null,
};

type Hold = 'hover' | 'focus' | 'queued';

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<
  number,
  { timer: ReturnType<typeof setTimeout> | null; left: number; startedAt: number; holds: Set<Hold> }
>();

/** The ones on screen: the newest few that aren't leaving, plus those playing their exit. */
export function onScreen(all: readonly ToastItem[]): ToastItem[] {
  const shown = new Set(
    all
      .filter((i) => !i.leaving)
      .slice(-VISIBLE_TOASTS)
      .map((i) => i.id),
  );
  return all.filter((i) => i.leaving || shown.has(i.id));
}

const publish = (next: ToastItem[]) => {
  // Too many waiting: drop the oldest waiting ones that aren't danger.
  const waiting = next.filter((i) => !i.leaving).slice(0, -VISIBLE_TOASTS);
  const dropped = new Set(
    waiting
      .filter((i) => i.tone !== 'danger')
      .slice(0, Math.max(0, waiting.length - QUEUED_TOASTS))
      .map((i) => i.id),
  );
  for (const id of dropped) clearTimer(id);
  items = dropped.size ? next.filter((i) => !dropped.has(i.id)) : next;
  // Only toasts on screen count down.
  const shown = new Set(onScreen(items).map((i) => i.id));
  for (const i of items) {
    if (i.leaving) continue;
    if (shown.has(i.id)) release(i.id, 'queued');
    else hold(i.id, 'queued');
  }
  for (const l of listeners) l();
};

function clearTimer(id: number) {
  const t = timers.get(id);
  if (t?.timer) clearTimeout(t.timer);
  timers.delete(id);
}

/** The exit animation's length: `--hl-dur-fast`, which is 0 with Reduce motion (and outside a browser). */
function exitMs(): number {
  if (typeof document === 'undefined') return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--hl-dur-fast').trim();
  const ms = value.endsWith('ms') ? parseFloat(value) : value.endsWith('s') ? parseFloat(value) * 1000 : 0;
  return Number.isFinite(ms) ? ms : 0;
}

export function dismissToast(id: number) {
  clearTimer(id);
  if (!items.some((i) => i.id === id && !i.leaving)) return;
  const ms = exitMs();
  const remove = () => publish(items.filter((i) => i.id !== id));
  if (ms <= 0) return remove();
  publish(items.map((i) => (i.id === id ? { ...i, leaving: true } : i)));
  setTimeout(remove, ms);
}

/** Changes a showing toast in place (a failed Retry says why). */
export function updateToast(id: number, patch: Partial<Omit<ToastItem, 'id' | 'leaving'>>) {
  publish(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

/** Toasts for notifications read elsewhere go (without marking anything again). */
export function dismissNotificationToasts(notificationIds: readonly string[]) {
  for (const i of items) if (i.notificationId && notificationIds.includes(i.notificationId)) dismissToast(i.id);
}

function run(id: number) {
  const t = timers.get(id);
  if (!t) return;
  t.startedAt = Date.now();
  t.timer = setTimeout(() => dismissToast(id), t.left);
}

function startTimer(id: number, tone: ToastTone) {
  clearTimer(id);
  const ms = TOAST_MS[tone];
  if (ms === null) return;
  // Held until publish says it's on screen.
  timers.set(id, { timer: null, left: ms, startedAt: 0, holds: new Set(['queued']) });
}

export function showToast(toast: Omit<ToastItem, 'id' | 'leaving'>): number {
  const same = toast.key ? items.find((i) => i.key === toast.key && !i.leaving) : undefined;
  if (same) {
    // A repeat: update it in place, and its time starts again.
    startTimer(same.id, toast.tone);
    publish(items.map((i) => (i.id === same.id ? { ...toast, id: same.id } : i)));
    return same.id;
  }
  const id = nextId++;
  startTimer(id, toast.tone);
  publish([...items, { ...toast, id }]);
  return id;
}

function hold(id: number, reason: Hold) {
  const t = timers.get(id);
  if (!t) return;
  t.holds.add(reason);
  if (!t.timer) return;
  clearTimeout(t.timer);
  t.timer = null;
  t.left -= Date.now() - t.startedAt;
}

function release(id: number, reason: Hold) {
  const t = timers.get(id);
  if (!t) return;
  t.holds.delete(reason);
  if (!t.timer && t.holds.size === 0) run(id);
}

/** Hover or focus inside the toast. */
export const pauseToast = (id: number, reason: 'hover' | 'focus' = 'hover') => hold(id, reason);
export const resumeToast = (id: number, reason: 'hover' | 'focus' = 'hover') => release(id, reason);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The toasts showing now. */
export const currentToasts = (): readonly ToastItem[] => items;

export const useToasts = () => useSyncExternalStore(subscribe, currentToasts);
