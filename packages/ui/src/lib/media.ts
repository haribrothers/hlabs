// The phone layout's breakpoint (D-054, US-PHONE-01): below 768px the dashboard has a tab bar and bottom sheets.
import { useSyncExternalStore } from 'react';

export const PHONE_QUERY = '(max-width: 767px)';

const matches = (query: string, fallback: boolean) =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? fallback
    : window.matchMedia(query).matches;

/** Whether a media query matches, following changes; `fallback` where there's no matchMedia (tests). */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => matches(query, fallback),
    () => fallback,
  );
}

/** The phone layout (< 768px): dialogs become bottom sheets (US-PHONE-03). False without matchMedia. */
export const useIsPhone = () => useMediaQuery(PHONE_QUERY, false);
