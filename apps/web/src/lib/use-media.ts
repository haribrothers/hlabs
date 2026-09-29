// Whether a CSS media query matches, following changes. Without matchMedia (tests) it reports `fallback`.
import { useSyncExternalStore } from 'react';

export function useMedia(query: string, fallback = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback),
  );
}

/** The Tailwind `md` breakpoint: the Dock and windows at 768px and up; the tab bar and sheets below (D-054). */
export const useIsDesktop = () => useMedia('(min-width: 768px)');
