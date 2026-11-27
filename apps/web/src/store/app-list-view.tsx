// A list of apps (the StoreCategory layout): a store home row's "See all" (US-STORE-01) and a category (US-STORE-02,
// US-STORE-04). A category sorts by Popular, New or A–Z (remembered in this browser) and says how many apps it has
// ("showing Apple Silicon compatible first" on arm64). Fifty at a time; the next page loads as the end comes near.
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { Search, iconDefaults } from '@hlabs/icons';
import { cn, PhoneHeader } from '@hlabs/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useIsDesktop } from '../lib/use-media';
import { StoreChips } from './categories';
import { PhoneAppList } from './phone-cards';
import { SEARCH_FIELD_ID } from './search';
import { storeCopy } from '../copy/store';
import { MoreOnScroll, useAppPages, type ListInput } from './app-pages';
import { AppCard } from './cards';
import { StoreView, useStoreBack } from './store-layout';
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

/**
 * A pill per option, the chosen one white (StoreCategory); a radio group to assistive tech. On a phone the iOS
 * segmented control, full width (PhoneRedesignA_StoreCategory).
 */
export function SortPills({
  value,
  onChange,
  phone = false,
}: {
  value: StoreSort;
  onChange: (s: StoreSort) => void;
  phone?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={copy.sortLabel}
      className={phone ? 'hl-p-seg hl-p-seg-wide' : 'flex flex-wrap gap-2'}
    >
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
          className={
            phone
              ? 'hl-focus'
              : cn(
                  'hl-focus inline-flex min-h-9 items-center rounded-pill px-4 text-body-sm',
                  value === s ? 'bg-fill-primary font-semibold text-ink-on-light' : 'bg-surface-row text-ink',
                )
          }
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
  const desktop = useIsDesktop();
  const back = useStoreBack();
  const navigate = useNavigate();
  if (!desktop)
    // A category or a "See all" list on a phone (US-PHONE-10, PhoneRedesignA_StoreCategory): "‹ App Store" and the
    // search, the name as a large title with how many apps, a category's chips and order, then the apps as rows.
    return (
      <StoreView title={heading} phoneTitle={false} ownPhoneHeader>
        <div className="flex flex-col gap-4 pb-2">
          <PhoneHeader
            title={heading}
            back={back}
            barTrailing={
              <button
                type="button"
                className="hl-p-tbtn hl-focus"
                aria-label={copy.searchLabel}
                onClick={() =>
                  void navigate({ to: '/store' }).then(() => document.getElementById(SEARCH_FIELD_ID)?.focus())
                }
              >
                <Search aria-hidden {...iconDefaults} />
              </button>
            }
            subtitle={
              first && sorting
                ? `${copy.appCount(first.counts.all)}${first.host.arm64 ? ` · ${copy.compatibleFirstShort[first.host.os]}` : ''}`
                : undefined
            }
          />
          {sortable ? <StoreChips /> : null}
          {sorting ? <SortPills value={sort} onChange={setSort} phone /> : null}
          {first ? (
            items.length ? (
              <PhoneAppList apps={items} installs={installs} label={heading} />
            ) : (
              <p className="m-0 text-body text-ink-muted">{empty ?? copy.empty}</p>
            )
          ) : null}
          <MoreOnScroll query={query} />
        </div>
      </StoreView>
    );
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
