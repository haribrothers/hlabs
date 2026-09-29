// A list of apps (the StoreCategory layout): a store home row's "See all" (US-STORE-01), a category (US-STORE-02) and
// search results (US-STORE-03). Sorting, filters and paging come with StoreCategory and StoreSearch in phase 7.
import type { AppRouter } from '@hlabs/api';
import { useQuery } from '@tanstack/react-query';
import type { inferRouterInputs } from '@trpc/server';
import type { ReactNode } from 'react';
import { storeCopy } from '../copy/store';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';
import { AppCard } from './cards';
import { StoreView } from './store-layout';
import { useInstalls } from './use-installs';

type ListInput = inferRouterInputs<AppRouter>['store']['listApps'];

export function AppListView({
  input,
  title,
  empty,
}: {
  input: ListInput;
  /** Defaults to the collection's title from the daemon. */
  title?: string;
  empty?: ReactNode;
}) {
  const trpc = useTRPC();
  const list = useQuery({ ...trpc.store.listApps.queryOptions(input), retry: false, ...pageQuery });
  const installs = useInstalls();
  const heading = title ?? (list.data?.title || storeCopy.allApps);
  return (
    <StoreView title={heading}>
      {list.data ? (
        list.data.items.length ? (
          <ul
            aria-label={heading}
            className="m-0 grid list-none grid-cols-1 gap-3 p-0 pb-6 md:grid-cols-2 xl:grid-cols-3"
          >
            {list.data.items.map((app) => (
              <li key={app.id}>
                <AppCard app={app} host={list.data.host} installs={installs} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-body text-ink-muted">{empty ?? storeCopy.empty}</p>
        )
      ) : null}
    </StoreView>
  );
}
