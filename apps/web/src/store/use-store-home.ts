// The store home (featured apps, rows, app count) for Discover and the search field's "Search N apps".
import { useQuery } from '@tanstack/react-query';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';

export function useStoreHome() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.store.getHome.queryOptions(), retry: false, ...pageQuery });
}
