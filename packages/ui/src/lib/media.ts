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

/**
 * A tablet by touch (D-175, US-TAB-01): 768px and wider with a touch screen and no mouse. Decided by the input, not
 * the width, so a touch laptop with a mouse keeps the mouse layout and a phone keeps the phone layout (D-172).
 */
export const TOUCH_QUERY = '(min-width: 768px) and (hover: none) and (pointer: coarse)';
/** An iPad held upright (US-TAB-05): the touch layout below 1024px, where sidebars become lists you go into. */
export const TOUCH_PORTRAIT_QUERY =
  '(min-width: 768px) and (max-width: 1023px) and (hover: none) and (pointer: coarse)';

/** The desktop layout by touch (US-TAB-01). False without matchMedia. */
export const useIsTouch = () => useMediaQuery(TOUCH_QUERY, false);
/** The touch layout on an iPad in portrait (US-TAB-05). False without matchMedia. */
export const useIsTouchPortrait = () => useMediaQuery(TOUCH_PORTRAIT_QUERY, false);

/**
 * Keeps `<html data-input="touch">` in step with TOUCH_QUERY (US-TAB-01): plugging in a mouse, or turning a tablet
 * into a phone-width window, takes it away at once, without a reload. Returns a stop function.
 */
export function watchInputMode(win: Window = window): () => void {
  if (typeof win.matchMedia !== 'function') return () => {};
  const root = win.document.documentElement;
  const list = win.matchMedia(TOUCH_QUERY);
  const apply = () => {
    if (list.matches) root.setAttribute('data-input', 'touch');
    else root.removeAttribute('data-input');
  };
  apply();
  list.addEventListener('change', apply);
  return () => list.removeEventListener('change', apply);
}
