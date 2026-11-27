// A store list a page at a time (US-STORE-04): the first 50 apps, then the next page as the end of the list comes into
// view (a little before, so it's there before you reach it: no visible jump).
import type { AppRouter } from '@hlabs/api';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { inferRouterInputs } from '@trpc/server';
import { useEffect, useRef } from 'react';
import { storeCopy } from '../copy/store';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';

export type ListInput = Omit<inferRouterInputs<AppRouter>['store']['listApps'], 'cursor'>;

export function useAppPages(input: ListInput, enabled = true) {
  const trpc = useTRPC();
  const q = useInfiniteQuery({
    ...trpc.store.listApps.infiniteQueryOptions(input, { getNextPageParam: (p) => p.nextCursor ?? undefined }),
    ...pageQuery,
    retry: false,
    enabled,
    // Another sort or filter keeps the list showing until the new order comes.
    placeholderData: keepPreviousData,
  });
  const first = q.data?.pages[0];
  return { query: q, first, items: q.data?.pages.flatMap((p) => p.items) ?? [] };
}

/** Asks for the next page when it comes near the view. */
export function MoreOnScroll({ query }: { query: ReturnType<typeof useAppPages>['query'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const watch = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '600px 0px' },
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  if (!hasNextPage) return null;
  return (
    <div ref={ref} role="status" className="py-4 text-center text-body-sm text-ink-muted">
      {isFetchingNextPage ? storeCopy.loadingMore : null}
    </div>
  );
}
