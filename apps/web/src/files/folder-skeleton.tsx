// While a folder loads (US-FILE-24, FilesLoading): nothing for the first 150 ms, then skeleton FileItems (12 in grid
// view, 8 rows in list view) that shimmer unless motion is reduced, and after 10 s a line saying the drive is slow.
import { useEffect, useState } from 'react';
import { filesCopy as copy } from '../copy/files';

export const SKELETON_AFTER_MS = 150;
export const SLOW_AFTER_MS = 10_000;

/** True once `active` has held for `ms`; false again as soon as it stops. */
export function useAfter(active: boolean, ms: number): boolean {
  const [since, setSince] = useState<{ active: boolean; done: boolean }>({ active, done: false });
  if (since.active !== active) setSince({ active, done: false });
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSince({ active: true, done: true }), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);
  return active && since.active === active && since.done;
}

const LIST_WIDTHS = ['46%', '38%', '52%', '30%', '44%', '36%', '50%', '34%'];

export function FolderSkeleton({ view = 'grid' }: { view?: 'grid' | 'list' }) {
  const shown = useAfter(true, SKELETON_AFTER_MS);
  const slow = useAfter(true, SLOW_AFTER_MS);
  return (
    <div role="status" aria-busy="true" aria-label={copy.loading} className="flex flex-1 flex-col gap-4">
      {!shown ? null : view === 'grid' ? (
        <div
          aria-hidden="true"
          className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] justify-items-center gap-x-2 gap-y-3"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="flex w-full flex-col items-center gap-2.5 px-2 py-3.5">
              <div className="hl-skeleton h-14.5 w-18 rounded-xs" />
              <div className="hl-skeleton h-3 w-4/5 rounded-pill" />
              <div className="hl-skeleton h-2.5 w-1/2 rounded-pill" />
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="overflow-hidden rounded-lg bg-surface-row">
          {LIST_WIDTHS.map((w, i) => (
            <div
              key={i}
              className="grid grid-cols-[40px_1fr_160px_110px] items-center border-t border-hairline px-4 py-3.5 first:border-t-0 max-md:grid-cols-[40px_1fr_80px]"
            >
              <span />
              <span className="flex items-center gap-3">
                <span className="hl-skeleton size-6 shrink-0 rounded-xs" />
                <span className="hl-skeleton h-3 rounded-pill" style={{ width: w }} />
              </span>
              <span className="hl-skeleton h-3 w-22 rounded-pill max-md:hidden" />
              <span className="flex justify-end">
                <span className="hl-skeleton h-3 w-14 rounded-pill" />
              </span>
            </div>
          ))}
        </div>
      )}
      {slow ? <p className="m-0 self-center text-body-sm text-ink-muted">{copy.stillLoading}</p> : null}
    </div>
  );
}
