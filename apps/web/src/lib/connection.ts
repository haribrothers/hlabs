// How this device is connected (US-STATE-19): offline (the browser says so), reconnecting (online, but the event
// stream has been down 5 s: a blip, or a captive portal that claims to be online), or fine. Offline wins.
import { useSyncExternalStore } from 'react';
import { RECONNECTING_AFTER_MS, streamDownSince, useStreamStatus } from './stream-status';

export type ConnectionProblem = 'offline' | 'reconnecting' | null;

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Now, outside React (the offline link). */
export function connectionProblem(now = Date.now()): ConnectionProblem {
  if (!isOnline()) return 'offline';
  const since = streamDownSince();
  return since !== null && now - since >= RECONNECTING_AFTER_MS ? 'reconnecting' : null;
}

export function useConnectionProblem(): ConnectionProblem {
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const stream = useStreamStatus();
  if (!online) return 'offline';
  return stream === 'reconnecting' ? 'reconnecting' : null;
}
