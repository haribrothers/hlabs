// Whether the live event stream is up (US-STATE-18): each subscription reports when it drops and when it's back;
// the stream counts as down from the first drop until all are back. "Reconnecting…" (US-STATE-19) shows once it's
// been down 5 s while /healthz still answers; 10 s without /healthz is the "Can't reach hlabs" state instead.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { checkHealth } from '../health/daemon-down';

export const RECONNECTING_AFTER_MS = 5_000;

const down = new Set<number>();
let downSince: number | null = null;
const listeners = new Set<() => void>();
const wakers = new Set<() => void>();

const notify = () => {
  for (const l of listeners) l();
};

export function markStreamDown(id: number, now = Date.now()) {
  down.add(id);
  if (downSince === null) {
    downSince = now;
    notify();
  }
}

export function markStreamUp(id: number) {
  if (!down.delete(id) || down.size > 0) return;
  downSince = null;
  notify();
}

/** A closed subscription no longer counts. */
export const forgetStream = (id: number) => markStreamUp(id);

/** When the stream went down, or null while it's up. */
export const streamDownSince = () => downSince;

/** Reconnect every waiting subscription now instead of after its backoff (the tab became visible again). */
export function reconnectNow() {
  for (const wake of [...wakers]) wake();
}

export function onReconnectNow(wake: () => void): () => void {
  wakers.add(wake);
  return () => wakers.delete(wake);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 'reconnecting' once the stream has been down for 5 s. */
export function useStreamStatus(): 'connected' | 'reconnecting' {
  const since = useSyncExternalStore(subscribe, streamDownSince);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (since === null) return;
    const wait = since + RECONNECTING_AFTER_MS - Date.now();
    if (wait <= 0) return;
    const timer = setTimeout(() => rerender((n) => n + 1), wait);
    return () => clearTimeout(timer);
  }, [since]);
  return since !== null && Date.now() - since >= RECONNECTING_AFTER_MS ? 'reconnecting' : 'connected';
}

/** Back on a tab that was hidden (maybe for hours): if hlabs answers, reconnect now rather than after the backoff. */
export function useReconnectWhenVisible() {
  useEffect(() => {
    const onChange = () => {
      if (document.hidden || streamDownSince() === null) return;
      void checkHealth().then((health) => {
        if (health.ok) reconnectNow();
      });
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
}
