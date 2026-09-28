// Toasts (US-STATE-14 timings): success and neutral leave after 5 s, warning after 10 s, danger stays. Hovering or
// focusing a toast pauses its timer. The first user is US-AUTH-09's "Recovery code used".
import { useSyncExternalStore } from 'react';

export type ToastTone = 'success' | 'warning' | 'danger';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  /** At most one action: a link inside the dashboard. */
  action?: { label: string; to: string };
}

export const TOAST_MS: Record<ToastTone, number | null> = { success: 5000, warning: 10_000, danger: null };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, { timer: ReturnType<typeof setTimeout> | null; left: number; startedAt: number }>();

const publish = (next: ToastItem[]) => {
  items = next;
  for (const l of listeners) l();
};

export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t?.timer) clearTimeout(t.timer);
  timers.delete(id);
  publish(items.filter((i) => i.id !== id));
}

function run(id: number) {
  const t = timers.get(id);
  if (!t) return;
  t.startedAt = Date.now();
  t.timer = setTimeout(() => dismissToast(id), t.left);
}

export function showToast(toast: Omit<ToastItem, 'id'>): number {
  const id = nextId++;
  publish([...items, { ...toast, id }]);
  const ms = TOAST_MS[toast.tone];
  if (ms !== null) {
    timers.set(id, { timer: null, left: ms, startedAt: 0 });
    run(id);
  }
  return id;
}

/** Hover or focus inside the toast. */
export function pauseToast(id: number) {
  const t = timers.get(id);
  if (!t?.timer) return;
  clearTimeout(t.timer);
  t.timer = null;
  t.left -= Date.now() - t.startedAt;
}

export function resumeToast(id: number) {
  const t = timers.get(id);
  if (t && !t.timer) run(id);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The toasts showing now. */
export const currentToasts = (): readonly ToastItem[] => items;

export const useToasts = () => useSyncExternalStore(subscribe, currentToasts);
