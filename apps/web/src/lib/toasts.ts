// Toasts (US-STATE-14): success and neutral leave after 5 s, warning after 10 s, danger stays until dismissed.
// Hovering or focusing a toast pauses its timer until both have gone. Leaving toasts stay a moment for their exit
// animation (none with Reduce motion). The first user was US-AUTH-09's "Recovery code used" (D-063).
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
}

export const TOAST_MS: Record<ToastTone, number | null> = {
  success: 5000,
  neutral: 5000,
  warning: 10_000,
  danger: null,
};

type Hold = 'hover' | 'focus';

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<
  number,
  { timer: ReturnType<typeof setTimeout> | null; left: number; startedAt: number; holds: Set<Hold> }
>();

const publish = (next: ToastItem[]) => {
  items = next;
  for (const l of listeners) l();
};

/** The exit animation's length: `--hl-dur-fast`, which is 0 with Reduce motion (and outside a browser). */
function exitMs(): number {
  if (typeof document === 'undefined') return 0;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--hl-dur-fast').trim();
  const ms = value.endsWith('ms') ? parseFloat(value) : value.endsWith('s') ? parseFloat(value) * 1000 : 0;
  return Number.isFinite(ms) ? ms : 0;
}

export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t?.timer) clearTimeout(t.timer);
  timers.delete(id);
  if (!items.some((i) => i.id === id && !i.leaving)) return;
  const ms = exitMs();
  const remove = () => publish(items.filter((i) => i.id !== id));
  if (ms <= 0) return remove();
  publish(items.map((i) => (i.id === id ? { ...i, leaving: true } : i)));
  setTimeout(remove, ms);
}

/** Changes a showing toast in place (a failed Retry says why). */
export function updateToast(id: number, patch: Partial<Pick<ToastItem, 'title' | 'body' | 'tone'>>) {
  publish(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
}

function run(id: number) {
  const t = timers.get(id);
  if (!t) return;
  t.startedAt = Date.now();
  t.timer = setTimeout(() => dismissToast(id), t.left);
}

export function showToast(toast: Omit<ToastItem, 'id' | 'leaving'>): number {
  const id = nextId++;
  publish([...items, { ...toast, id }]);
  const ms = TOAST_MS[toast.tone];
  if (ms !== null) {
    timers.set(id, { timer: null, left: ms, startedAt: 0, holds: new Set() });
    run(id);
  }
  return id;
}

/** Hover or focus inside the toast. */
export function pauseToast(id: number, hold: Hold = 'hover') {
  const t = timers.get(id);
  if (!t) return;
  t.holds.add(hold);
  if (!t.timer) return;
  clearTimeout(t.timer);
  t.timer = null;
  t.left -= Date.now() - t.startedAt;
}

export function resumeToast(id: number, hold: Hold = 'hover') {
  const t = timers.get(id);
  if (!t) return;
  t.holds.delete(hold);
  if (!t.timer && t.holds.size === 0) run(id);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The toasts showing now. */
export const currentToasts = (): readonly ToastItem[] => items;

export const useToasts = () => useSyncExternalStore(subscribe, currentToasts);
