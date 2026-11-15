// Search files (US-FILE-04): names containing what's typed (2 characters or more, after a 250 ms pause), in the open
// place and every folder below it. Results show the folder they're in; Escape or clearing the field returns to the
// folder.
import type { FileEntry } from '@hlabs/api';
import { iconDefaults, Search } from '@hlabs/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { filesCopy as copy } from '../copy/files';
import { useIsDesktop } from '../lib/use-media';
import { useTRPC } from '../lib/trpc';
import { FileGrid } from './file-grid';
import type { FilesMe } from './places';
import { crumbName } from './places';

export const SEARCH_MIN = 2;
export const SEARCH_DEBOUNCE_MS = 250;
export const SEARCH_LIMIT = 200;

/** The query once typing pauses for 250 ms; '' while it's shorter than 2 characters. */
export function useDebouncedQuery(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);
  // Cleared (or too short) at once; a longer query once typing has paused.
  if (value.trim().length < SEARCH_MIN) return '';
  const q = settled.trim();
  return q.length < SEARCH_MIN ? '' : q;
}

/** "Home › Documents › Bills" for a result: the searched folder's breadcrumb, then the folders below it. */
export function resultFolder(crumbs: Array<{ path: string; name: string | null }>, root: string, path: string): string {
  const below = path.slice(root.length).split('/').filter(Boolean).slice(0, -1);
  return [...crumbs.map(crumbName), ...below].join(' › ');
}

export function SearchField({
  value,
  onChange,
  place,
}: {
  value: string;
  onChange: (value: string) => void;
  /** "Documents": the placeholder on a phone says where it searches (PhoneFiles). */
  place: string;
}) {
  const desktop = useIsDesktop();
  return (
    <div role="search" className="relative w-full md:w-56">
      <Search
        aria-hidden
        {...iconDefaults}
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
      <input
        type="search"
        className="hl-input w-full rounded-pill pl-10"
        aria-label={copy.search}
        placeholder={desktop ? copy.searchPlaceholder : copy.searchIn(place)}
        maxLength={200}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            // Back to the folder (and Escape doesn't close the window).
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          }
        }}
      />
    </div>
  );
}

export function SearchResults({
  path,
  query,
  crumbs,
  me,
  onOpenFile,
}: {
  path: string;
  query: string;
  crumbs: Array<{ path: string; name: string | null }>;
  me: FilesMe;
  onOpenFile: (entry: FileEntry, items: FileEntry[]) => void;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const found = useQuery({
    ...trpc.files.search.queryOptions({ path, query, limit: SEARCH_LIMIT }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const data = found.data;
  if (!data) {
    return (
      <p className="m-0 py-16 text-center text-body text-ink-muted" role="status">
        {copy.searching}
      </p>
    );
  }
  if (data.items.length === 0) {
    return (
      <p className="m-0 py-16 text-center text-headline" role="status">
        {copy.noMatches(query)}
      </p>
    );
  }
  const note = data.capped ? copy.capped(SEARCH_LIMIT) : data.truncated ? copy.truncated : null;
  return (
    <div className="flex flex-col gap-3">
      <FileGrid
        items={data.items}
        label={copy.results}
        accent={me.accent}
        onOpen={(e) =>
          e.kind === 'folder' ? void navigate({ to: '/files', search: { path: e.path } }) : onOpenFile(e, data.items)
        }
        openOnClick={!desktop}
        below={(e) => resultFolder(crumbs, path, e.path)}
      />
      {note ? (
        <p className="m-0 text-center text-caption text-ink-muted" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
