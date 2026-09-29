// Coming back from an app's details to the exact list and scroll position (US-STORE-06). The store window records the
// view you were on and how far each view was scrolled; details' "App Store" returns there.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

const positions = new Map<string, number>();
let lastView: string | null = null;

/** The store view to go back to from details (`/store` when details was opened directly). */
export function storeReturnHref(): string {
  return lastView ?? '/store';
}

/** The shell's scrolling page (`<main id="main">`), which scrolls on a phone. */
export const pageScroller = (): HTMLElement | null => document.getElementById('main');

/**
 * Remembers `href` as the current store view and its scroll position, and puts the position back when the view is
 * shown again. `scroller` is the store window's scrolling element (desktop); without it the page scrolls (phone).
 */
export function useStoreScrollMemory(href: string, scroller: RefObject<HTMLElement | null> | null) {
  const current = useRef(href);
  // Leaving for details re-renders the window once with the details address before it closes: that isn't a view.
  const isView = !href.startsWith('/store/app/');
  useEffect(() => {
    if (!isView) return;
    lastView = href;
    current.current = href;
  }, [href, isView]);

  useLayoutEffect(() => {
    if (!isView) return;
    const el = scroller?.current ?? pageScroller();
    if (el) el.scrollTop = positions.get(href) ?? 0;
  }, [href, scroller, isView]);

  useEffect(() => {
    const el = scroller?.current ?? pageScroller();
    if (!el) return;
    const onScroll = () => positions.set(current.current, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scroller]);
}
