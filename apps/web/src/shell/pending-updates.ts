// How many app updates wait (the App Store's badge, US-HOME-05, US-STORE-15): admins only, once the updates list ships
// (feature `appUpdates`). No event stream of its own (each page already holds a few, and browsers allow six
// connections per site): it shares `store.listUpdates` with the Updates pages, which refresh it on events, and looks
// again every few minutes and when the tab comes back.
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';

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
  return enabled ? (updates.data?.pending.length ?? 0) : 0;
}
