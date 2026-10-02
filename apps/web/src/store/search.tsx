// Store search (US-STORE-03): one field for the whole store window, "Search N apps". Typing opens the results after a
// 200 ms pause (Enter opens them at once); clearing it goes back to the view you came from; Escape clears it; "/"
// focuses it from anywhere in the store on desktop. Results are the StoreSearch list (filters come in phase 7).
import { Search, iconDefaults } from '@hlabs/icons';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { storeCopy } from '../copy/store';
import { useStoreHome } from './use-store-home';

const copy = storeCopy;
export const SEARCH_DELAY_MS = 200;
export const SEARCH_FIELD_ID = 'store-search';

/** Queries are trimmed and at most 100 characters (US-STORE-05). */
export const cleanQuery = (q: string) => q.trim().slice(0, 100);

export function StoreSearchField({ desktop }: { desktop: boolean }) {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const onResults = location.pathname === '/store/search';
  const urlQuery = onResults ? String((location.search as { q?: unknown }).q ?? '') : '';
  const [value, setValue] = useState(urlQuery);
  // Where to go back to when the field is cleared: the store view before the search began.
  const cameFrom = useRef('/store');
  const input = useRef<HTMLInputElement>(null);
  const total = useStoreHome().data?.totalApps;

  // Follow the address (back/forward, a link to results): adjust the field when the query in it changes.
  const [shown, setShown] = useState(urlQuery);
  if (onResults && urlQuery !== shown) {
    setShown(urlQuery);
    // Not while typing: "photo " stays as typed when the results for "photo" open.
    if (cleanQuery(value) !== urlQuery) setValue(urlQuery);
  }
  useEffect(() => {
    if (!onResults) cameFrom.current = location.pathname;
  }, [onResults, location.pathname]);

  const show = (raw: string) => {
    const q = cleanQuery(raw);
    if (!q) {
      if (onResults) void navigate({ to: cameFrom.current });
      return;
    }
    if (onResults && q === urlQuery) return;
    void navigate({ to: '/store/search', search: { q }, replace: onResults });
  };

  // Results follow typing after a short pause.
  useEffect(() => {
    if (cleanQuery(value) === urlQuery) return;
    const timer = setTimeout(() => show(value), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `show` reads the latest route on each run
  }, [value]);

  // "/" anywhere in the store (desktop) focuses the field, unless typing somewhere else.
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desktop]);

  return (
    <div role="search" className="relative w-full md:w-80">
      <Search
        aria-hidden
        {...iconDefaults}
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
      <input
        ref={input}
        id={SEARCH_FIELD_ID}
        type="search"
        className="hl-input w-full rounded-pill pl-10"
        aria-label={copy.searchLabel}
        placeholder={total === undefined ? copy.searchLabel : copy.searchPlaceholder(total)}
        maxLength={100}
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            show(value);
          } else if (e.key === 'Escape' && value) {
            // Clears the query (and keeps Escape from closing anything else).
            e.preventDefault();
            e.stopPropagation();
            setValue('');
            show('');
          }
        }}
      />
    </div>
  );
}
