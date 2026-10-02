// Which app windows are open (US-HOME-23), in the order they were opened. "Back to Home" leaves a window open behind
// Home, where the Dock shows it with a dot and brings it back; "Close app", Esc and an uninstall close it. Kept for
// this browser tab (sessionStorage), so a reload keeps the Dock as it was; every access is guarded, since storage can
// be missing or blocked.
import { useSyncExternalStore } from 'react';

const KEY = 'hlabs.openWindows';
const listeners = new Set<() => void>();

function load(): string[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

let open: readonly string[] = load();

function publish(next: readonly string[]) {
  open = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the Dock still knows until the tab closes.
  }
  for (const l of listeners) l();
}

export function openWindow(appId: string) {
  if (!open.includes(appId)) publish([...open, appId]);
}

export function closeWindow(appId: string) {
  if (open.includes(appId)) publish(open.filter((id) => id !== appId));
}

/** The open windows, oldest first. */
export function useOpenWindows(): readonly string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => open,
  );
}

/** Tests start from no open windows. */
export function resetOpenWindows() {
  publish([]);
}
