// The open folder (US-FILE-02, FilesBrowser): breadcrumb, search and the toolbar on top, the grid, and a footer that
// says how much is here and who can see it. Errors and empty folders say what to do next.
import type { FileEntry } from '@hlabs/api';
import { formatBytes, isFeatureEnabled } from '@hlabs/shared';
import { Button, ScrollPane } from '@hlabs/ui';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { errorCode, errorData, pageQuery } from '../lib/error-copy';
import { useIsDesktop } from '../lib/use-media';
import { useTRPC } from '../lib/trpc';
import { Breadcrumb } from './breadcrumb';
import { FileGrid, type SelectProps } from './file-grid';
import { FileList } from './file-list';
import { FolderSkeleton } from './folder-skeleton';
import { RenameDialog } from './rename-dialog';
import type { DragProps } from './drag';
import { DEFAULT_SORT, type FilesSort, type FilesView, type SortBy } from './view-prefs';
import { clickSelect, emptySelection, selectAll, toggleSelect, type Selection } from './selection';
import { canShareFiles, PhoneSelectionBar, SelectionBar, shareFiles, type SelectionActions } from './selection-bar';
import { crumbName, HOME, type FilesMe } from './places';

export type { FilesMe };
import { SearchResults } from './search';

type Listing = {
  place: { area: string; name: string | null; readOnly: boolean };
  crumbs: Array<{ path: string; name: string | null }>;
  count: number;
  filesBytes: number;
};

/** Who can see this folder, at the right of the footer (US-FILE-02). */
export function footerRight(place: Listing['place'], me: FilesMe): string {
  switch (place.area) {
    case 'home':
      return copy.privateHome(me.displayName);
    case 'user':
      return copy.someonesHome(place.name ?? '');
    case 'shared':
      return copy.sharedFooter;
    case 'drive':
      return copy.driveFooter(place.name ?? '');
    case 'app':
      return copy.appDataFooter(place.name ?? '');
    case 'appdata':
      return copy.appDataListFooter;
    default:
      return copy.computerFooter;
  }
}

/**
 * The breadcrumb while a folder loads (US-FILE-24): each step of the path, named from listings already fetched
 * (a drive's or a person's name) or by its folder name; the tops of places name themselves.
 */
export function provisionalCrumbs(path: string, known: Map<string, string | null>): Listing['crumbs'] {
  const parts = path.split('/').filter(Boolean);
  return parts.map((part, i) => {
    const at = `/${parts.slice(0, i + 1).join('/')}`;
    if (known.has(at)) return { path: at, name: known.get(at) ?? null };
    return { path: at, name: i === 0 ? null : part };
  });
}

/** Until a listing says, a place is read only when it's App data or a list of places (US-FILE-24). */
export function provisionalReadOnly(path: string): boolean {
  return path.startsWith('/appdata') || path === '/users' || path === '/drives';
}

/** The whole folder: pages of 200 are fetched one after another until it's all here. */
export function useFolder(path: string, sort: FilesSort = DEFAULT_SORT) {
  const trpc = useTRPC();
  const q = useInfiniteQuery({
    ...trpc.files.list.infiniteQueryOptions(
      { path, sort: sort.by, dir: sort.dir },
      { getNextPageParam: (p) => p.nextCursor ?? undefined },
    ),
    ...pageQuery,
    retry: false,
    // Sorting again keeps showing this folder until the new order comes; another folder starts empty (US-FILE-24).
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[1] as { input?: { path?: string } } | undefined)?.input?.path === path
        ? previous
        : undefined,
    // Preview links last 5 minutes: listings are fetched again before they run out.
    staleTime: 30_000,
    refetchInterval: 4 * 60_000,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const first = q.data?.pages[0];
  return {
    query: q,
    listing: first as (typeof first & Listing) | undefined,
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
  };
}

/** The names of steps already seen in fetched listings, by path. */
function knownCrumbs(
  queryClient: ReturnType<typeof useQueryClient>,
  key: readonly unknown[],
): Map<string, string | null> {
  const known = new Map<string, string | null>();
  for (const [, data] of queryClient.getQueriesData<{ pages: Array<{ crumbs: Listing['crumbs'] }> }>({
    queryKey: key,
  })) {
    for (const c of data?.pages[0]?.crumbs ?? []) known.set(c.path, c.name);
  }
  return known;
}

function Message({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="m-0 text-headline">{title}</p>
      {body ? <p className="m-0 text-body text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function FolderView({
  path,
  me,
  toolbar,
  search,
  focusPath,
  onOpenFile,
  onRetryDrive,
  searchQuery = '',
  onDropFiles,
  notice,
  view = 'grid',
  sort = DEFAULT_SORT,
  onSort,
  selectionActions,
  onDropItems,
}: {
  /** Move to… and Move to Trash for the selected items, once their stories ship (US-FILE-22, US-FILE-16). */
  selectionActions?: (entries: FileEntry[], clear: () => void, readOnly: boolean) => Omit<SelectionActions, 'onShare'>;
  /** Items dragged onto a folder here (US-FILE-22). */
  onDropItems?: (entries: FileEntry[], from: string, to: FileEntry) => void;
  /** Grid or list, and the order (US-FILE-19). */
  view?: FilesView;
  sort?: FilesSort;
  onSort?: (by: SortBy) => void;
  path: string;
  me: FilesMe;
  /** New folder, Upload … for this place (they know whether it's read only), and the folder's name. */
  toolbar?: (place: Listing['place'], folderName: string) => ReactNode;
  /** Files dropped on a folder that can take them (US-FILE-08). */
  onDropFiles?: (data: DataTransfer, folderName: string) => void;
  /** Above the folder: "<n> uploads were interrupted" (US-FILE-09). */
  notice?: (folderName: string) => ReactNode;
  /** The search field; it replaces the folder with results while there's a query. */
  search?: ReactNode;
  focusPath?: string | null;
  onOpenFile: (entry: FileEntry, items: FileEntry[]) => void;
  /** A drive that can't be reached: mount it again (US-FILE-12). */
  onRetryDrive?: (driveId: string) => Promise<void>;
  /** Search results instead of the folder while there's a query (US-FILE-04). */
  searchQuery?: string;
}) {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const { query, listing, items } = useFolder(path, sort);
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  // Before the listing comes, the breadcrumb and toolbar show what's known, so they can be used meanwhile.
  const crumbs = listing?.crumbs ?? provisionalCrumbs(path, knownCrumbs(queryClient, trpc.files.list.pathKey()));
  const place = listing?.place ?? { area: 'home', name: null, readOnly: provisionalReadOnly(path) };
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  const [focusAfter, setFocusAfter] = useState<string | null>(null);
  // The selection belongs to this folder (US-FILE-20): opening another one clears it, and a phone's Select mode ends.
  const [selState, setSel] = useState<Selection>(() => emptySelection(path));
  const [selectingIn, setSelectingIn] = useState<string | null>(null);
  // Another folder: start again (adjusting state while rendering, as React suggests for a changed prop).
  if (selState.folder !== path) setSel(emptySelection(path));
  const sel = selState.folder === path ? selState : emptySelection(path);
  const selecting = !desktop && selectingIn === path;
  const order = items.map((e) => e.path);
  const chosen = items.filter((e) => sel.paths.includes(e.path));
  const clear = () => setSel(emptySelection(path));
  const select: SelectProps = {
    selected: new Set(chosen.map((e) => e.path)),
    onSelect: (e, mods) => setSel(clickSelect(sel, order, e.path, mods)),
    onToggle: (e) => setSel(toggleSelect(sel, e.path)),
    onSelectAll: () => setSel(selectAll(sel, order)),
    selecting,
  };
  const actions: SelectionActions = {
    ...selectionActions?.(chosen, clear, place.readOnly),
    // The device's share sheet takes files, not folders (US-FILE-20).
    ...(canShareFiles() && chosen.length > 0 && chosen.every((e) => e.kind === 'file')
      ? { onShare: () => void shareFiles(chosen).catch(() => {}) }
      : {}),
  };
  // Esc clears the selection before it would close the window (FilesPage checks defaultPrevented).
  const hasSelection = chosen.length > 0 || selecting;
  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      e.preventDefault();
      setSel(emptySelection(path));
      setSelectingIn(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [hasSelection, path]);
  const [retrying, setRetrying] = useState(false);
  // Dragging items onto a folder moves them (US-FILE-22); not out of a read-only place.
  const drag: DragProps | undefined =
    onDropItems && !place.readOnly && isFeatureEnabled('filesMove')
      ? {
          carry: (e) => (select.selected.has(e.path) ? chosen : [e]),
          from: path,
          onDrop: (folder, entries, from) => onDropItems(entries, from, folder),
        }
      : undefined;
  const canRename = !place.readOnly && isFeatureEnabled('filesRename');
  const last = crumbs[crumbs.length - 1];
  const folderName = last ? crumbName(last) : copy.title;
  const canDrop = !!listing && !listing.place.readOnly && !!onDropFiles;
  const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const dropProps = canDrop
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(false);
          onDropFiles!(e.dataTransfer, folderName);
        },
      }
    : {};
  const overlay = dragging ? (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent"
    >
      <span className="rounded-pill bg-surface-dialog px-4 py-2 text-label text-ink">{copy.dropTo(folderName)}</span>
    </div>
  ) : null;
  const open = (e: FileEntry) =>
    e.kind === 'folder' ? void navigate({ to: '/files', search: { path: e.path } }) : onOpenFile(e, items);

  let body: ReactNode;
  if (search && listing && searchQuery) {
    body = <SearchResults path={path} query={searchQuery} crumbs={listing.crumbs} me={me} onOpenFile={onOpenFile} />;
  } else if (query.isError) {
    const code = errorCode(query.error);
    if (code === 'NOT_FOUND') {
      body = (
        <Message
          title={copy.gone}
          action={
            <Button variant="secondary" onClick={() => void navigate({ to: '/files', search: { path: HOME } })}>
              {copy.goHome}
            </Button>
          }
        />
      );
    } else if (code === 'NAS_UNREACHABLE') {
      const name = String((errorData(query.error)?.detail as { location?: string } | null)?.location ?? '');
      const driveId = /^\/drives\/([^/]+)/.exec(path)?.[1];
      body = (
        <Message
          title={copy.cantReach(name)}
          body={copy.cantReachBody}
          action={
            <Button
              variant="secondary"
              busy={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  if (driveId && onRetryDrive) await onRetryDrive(driveId).catch(() => {});
                  await query.refetch();
                } finally {
                  setRetrying(false);
                }
              }}
            >
              {copy.tryAgain}
            </Button>
          }
        />
      );
    } else {
      body = (
        <Message
          title={copy.loadFailed}
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              {copy.tryAgain}
            </Button>
          }
        />
      );
    }
  } else if (!listing) {
    body = <FolderSkeleton view={view} />;
  } else if (items.length === 0) {
    body = <Message title={copy.emptyFolder} body={listing.place.readOnly ? undefined : copy.emptyWritable} />;
  } else {
    const name = last?.name ?? copy.areaNames[last?.path ?? ''] ?? copy.title;
    body =
      view === 'list' ? (
        <FileList
          items={items}
          label={name}
          accent={me.accent}
          sort={sort}
          onSort={onSort ?? (() => {})}
          onOpen={open}
          openOnClick={!desktop}
          select={select}
          drag={drag}
          onRename={canRename ? setRenaming : undefined}
          focusPath={focusAfter ?? focusPath}
        />
      ) : (
        <FileGrid
          items={items}
          label={name}
          accent={me.accent}
          onOpen={open}
          openOnClick={!desktop}
          select={select}
          drag={drag}
          onRename={canRename ? setRenaming : undefined}
          focusPath={focusAfter ?? focusPath}
        />
      );
  }

  const footer =
    listing && !searchQuery ? (
      <footer className="flex flex-wrap items-center justify-between gap-2 px-7 pt-2 pb-5 max-md:px-0 text-caption text-ink-muted">
        <span>
          {chosen.length > 0
            ? copy.footerSelected(
                copy.items(listing.count),
                chosen.length,
                formatBytes(chosen.reduce((n, e) => n + (e.size ?? 0), 0)),
              )
            : copy.footer(copy.items(listing.count), formatBytes(listing.filesBytes))}
        </span>
        <span>{chosen.length > 0 && desktop ? copy.rangeHint : footerRight(listing.place, me)}</span>
      </footer>
    ) : null;

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <Breadcrumb crumbs={crumbs} />
      </div>
      <div className="flex flex-wrap items-center gap-2 max-md:w-full">
        {search}
        {selecting ? (
          <>
            <span className="flex-1 text-headline">{copy.selected(chosen.length)}</span>
            <Button variant="secondary" size="sm" onClick={() => setSel(selectAll(sel, order))}>
              {copy.selectAll}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSelectingIn(null);
                clear();
              }}
            >
              {copy.done}
            </Button>
          </>
        ) : (
          <>
            {toolbar && !query.isError ? toolbar(place, folderName) : null}
            {!desktop && listing && items.length > 0 ? (
              <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setSelectingIn(path)}>
                {copy.select}
              </Button>
            ) : null}
          </>
        )}
      </div>
      {desktop && chosen.length > 0 && !searchQuery ? (
        <div className="basis-full">
          <SelectionBar entries={chosen} actions={actions} onClear={clear} />
        </div>
      ) : null}
    </div>
  );

  const dialogs = renaming ? (
    <RenameDialog
      entry={renaming}
      onClose={() => setRenaming(null)}
      onRenamed={(renamed) => {
        // It stays selected and focused under its new name (US-FILE-23).
        setSel({ folder: path, paths: [renamed], anchor: renamed });
        setFocusAfter(renamed);
      }}
    />
  ) : null;

  // A phone scrolls the whole page (PhoneFiles); a desktop window scrolls the folder under its header.
  if (!desktop) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {header}
        {notice?.(folderName)}
        <div className="flex flex-col">{body}</div>
        {footer}
        {selecting ? <PhoneSelectionBar entries={chosen} actions={actions} /> : null}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" {...dropProps}>
      {overlay}
      <ScrollPane
        className="min-h-0 flex-1"
        header={header}
        headerClassName="px-7 pt-6 pb-4"
        scrollClassName="mr-2"
        bodyClassName="flex min-h-full flex-col px-5 pb-5"
      >
        {notice?.(folderName)}
        {body}
      </ScrollPane>
      {footer}
      {dialogs}
    </div>
  );
}
