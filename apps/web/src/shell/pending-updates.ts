// How many app updates wait (the App Store's badge, US-HOME-05, US-STORE-15): admins only, once the updates list ships
// (feature `appUpdates`). It shares `store.listUpdates` with the Updates pages, follows `app.updatesAvailable` and
// finished updates on the page's one event stream (the tab bar's badge changes without a reload, US-PHONE-01), and
// looks again every few minutes and when the tab comes back.
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';

const EVERY_MS = 5 * 60_000;

export function usePendingUpdates(admin: boolean, shippedPhase = VISIBLE_PHASE): number {
  const trpc = useTRPC();
  const enabled = admin && isFeatureEnabled('appUpdates', shippedPhase);
  const updates = useQuery({
    ...trpc.store.listUpdates.queryOptions(),
    enabled,
    retry: false,
    refetchInterval: EVERY_MS,
    refetchOnWindowFocus: true,
  });
  const queryClient = useQueryClient();
  useEventStream((event) => {
    if (!enabled) return;
    if (event.type === 'app.updatesAvailable' || (event.type === 'job.finished' && event.data.kind === 'app_update'))
      void queryClient.invalidateQueries({ queryKey: trpc.store.listUpdates.queryKey() });
  });
  return enabled ? (updates.data?.pending.length ?? 0) : 0;
}
