// A panel over the page that Back closes (US-PHONE-04): Spotlight and the notifications sheet on a phone. Opening it
// adds a history entry for the same address, marked with its name; Back (or the swipe-back gesture) leaves that entry
// and the panel closes. Closing it any other way steps back over the entry first, so Back never lands on a closed
// panel's step.
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** A panel opened over this page (US-PHONE-04): Back closes it. */
    layer?: string;
  }
}

/**
 * `open` is the panel's state and `onClosed` closes it. Returns `close`, which steps back over the panel's entry (if it
 * has one) and resolves once the address is back, so what the panel does next (navigating somewhere) starts from the
 * page itself. `enabled` false: no entry (the desktop).
 */
export function useHistoryLayer(name: string, open: boolean, onClosed: () => void, enabled = true) {
  const router = useRouter();
  const layer = useRouterState({ select: (s) => s.location.state.layer });
  const pushed = useRef(false);
  const latest = useRef({ open, onClosed, layer });
  useEffect(() => {
    latest.current = { open, onClosed, layer };
  });

  useEffect(() => {
    if (!enabled || !open || latest.current.layer === name) return;
    const { href, state } = router.state.location;
    router.history.push(href, { ...state, layer: name });
    pushed.current = true;
  }, [enabled, open, name, router]);

  useEffect(() => {
    if (!pushed.current || layer === name) return;
    pushed.current = false;
    if (latest.current.open) latest.current.onClosed();
  }, [layer, name]);

  return (): Promise<void> =>
    new Promise((resolve) => {
      if (pushed.current && latest.current.layer === name) {
        const stop = router.history.subscribe(() => {
          stop();
          resolve();
        });
        router.history.back();
      } else {
        latest.current.onClosed();
        resolve();
      }
    });
}
