// Coming back to the dashboard (US-PHONE-04): a phone that slept, an app switch, or iOS restoring the page from its
// back-forward cache (pageshow with persisted). The event stream may have died without saying so, so it is opened
// again at once (resuming from the last event id), and every query on screen refetches; a session that ended
// meanwhile then sends the page to log in with `next` (the auth-lost handler, US-AUTH-14).
import type { QueryClient } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { reconnectNow } from './stream-status';

/** Refreshes now: the stream reconnects, active queries refetch. */
export function resume(queryClient: QueryClient) {
  reconnectNow({ force: true });
  void queryClient.invalidateQueries({ refetchType: 'active' });
}

/** Starts listening; returns a stop function. */
export function watchResume(queryClient: QueryClient, doc: Document = document, win: Window = window): () => void {
  let hidden = doc.hidden;
  const onVisibility = () => {
    if (doc.hidden) {
      hidden = true;
      return;
    }
    if (!hidden) return;
    hidden = false;
    resume(queryClient);
  };
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) resume(queryClient);
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pageshow', onPageShow);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pageshow', onPageShow);
  };
}

/** For the signed-in shell. */
export function useRefreshOnResume() {
  const queryClient = useQueryClient();
  useEffect(() => watchResume(queryClient), [queryClient]);
}
