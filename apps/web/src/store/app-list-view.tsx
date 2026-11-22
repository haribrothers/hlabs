// A list of apps (the StoreCategory layout): a store home row's "See all" (US-STORE-01) and a category (US-STORE-02,
// US-STORE-04). A category sorts by Popular, New or A–Z (remembered in this browser) and says how many apps it has
// ("showing Apple Silicon compatible first" on arm64). Fifty at a time; the next page loads as the end comes near.
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { cn } from '@hlabs/ui';
import { useState, type ReactNode } from 'react';
import { storeCopy } from '../copy/store';
import { MoreOnScroll, useAppPages, type ListInput } from './app-pages';
import { AppCard } from './cards';
import { StoreView } from './store-layout';
import { useInstalls } from './use-installs';

const copy = storeCopy;

export type StoreSort = 'popular' | 'new' | 'name';
const SORTS: readonly StoreSort[] = ['popular', 'new', 'name'];
export const SORT_KEY = 'hlabs.store.sort';

function readSort(): StoreSort {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    if (SORTS.includes(saved as StoreSort)) return saved as StoreSort;
  } catch {
    // Unreadable (a private window): the default.
  }
  return 'popular';
}

/** The sort this browser chose last (US-STORE-04). */
function useStoreSort(): [StoreSort, (s: StoreSort) => void] {
  const [sort, setSort] = useState<StoreSort>(readSort);
  return [
    sort,
    (next) => {
      setSort(next);
      try {
        localStorage.setItem(SORT_KEY, next);
      } catch {
        // Not kept: fine.
      }
    },
  ];
}

/** A pill per option, the chosen one white (StoreCategory); a radio group to assistive tech. */
export function SortPills({ value, onChange }: { value: StoreSort; onChange: (s: StoreSort) => void }) {
  return (
    <div role="radiogroup" aria-label={copy.sortLabel} className="flex flex-wrap gap-2">
      {SORTS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          onKeyDown={(e) => {
            const step =
              e.key === 'ArrowRight' || e.key === 'ArrowDown'
                ? 1
                : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                  ? -1
                  : 0;
            if (!step) return;
            e.preventDefault();
            const next = SORTS[(SORTS.indexOf(value) + step + SORTS.length) % SORTS.length]!;
            onChange(next);
            (e.currentTarget.parentElement?.querySelector(`[data-sort="${next}"]`) as HTMLElement | null)?.focus();
          }}
          data-sort={s}
          tabIndex={value === s ? 0 : -1}
          className={cn(
            'hl-focus inline-flex min-h-9 items-center rounded-pill px-4 text-body-sm',
            value === s ? 'bg-fill-primary font-semibold text-ink-on-light' : 'bg-surface-row text-ink',
          )}
        >
          {copy.sorts[s]}
        </button>
      ))}
    </div>
  );
}

export function AppListView({
  input,
  title,
  empty,
  sortable = false,
  shippedPhase = VISIBLE_PHASE,
}: {
  input: ListInput;
  /** Defaults to the collection's title from the daemon. */
  title?: string;
  empty?: ReactNode;
  /** A category: the sort and the count line (phase 7). */
  sortable?: boolean;
  shippedPhase?: number;
}) {
  const sorting = sortable && isFeatureEnabled('storeBrowse', shippedPhase);
  const [sort, setSort] = useStoreSort();
  const { query, first, items } = useAppPages(sorting ? { ...input, sort } : input);
  const installs = useInstalls();
  const heading = title ?? (first?.title || copy.allApps);
  return (
    <StoreView title={heading}>
      {first ? (
        <div className="flex flex-col gap-5 pb-6">
          {sorting ? (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <SortPills value={sort} onChange={setSort} />
              <p className="m-0 text-body-sm text-ink-muted">
                {copy.appCount(first.counts.all)}
                {first.host.arm64 ? ` · ${copy.compatibleFirst[first.host.os]}` : ''}
              </p>
            </div>
          ) : null}
          {items.length ? (
            <ul aria-label={heading} className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
              {items.map((app) => (
                <li key={app.id}>
                  <AppCard app={app} host={first.host} installs={installs} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-body text-ink-muted">{empty ?? copy.empty}</p>
          )}
          <MoreOnScroll query={query} />
        </div>
      ) : null}
    </StoreView>
  );
}
