// Whether search is open (US-HOME-09): one panel for the whole dashboard, opened by ⌘K / Ctrl+K, the Home pill or
// the Dock's Search.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();
const publish = (next: boolean) => {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
};

export const openSearch = () => publish(true);
export const closeSearch = () => publish(false);
export const toggleSearch = () => publish(!open);

export function useSearchOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
    () => open,
  );
}

/** Mac keyboards say ⌘, others Ctrl (US-HOME-09). */
export function isMac(nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator): boolean {
  return /Mac|iPhone|iPad/i.test(nav.platform || nav.userAgent);
}

/** ⌘K on a Mac, Ctrl+K elsewhere. */
export const isSearchShortcut = (e: KeyboardEvent, mac = isMac()) =>
  e.key.toLowerCase() === 'k' && (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey;
