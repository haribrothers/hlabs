// The open folder (US-FILE-02, FilesBrowser): breadcrumb, search and the toolbar on top, the grid, and a footer that
// says how much is here and who can see it. Errors and empty folders say what to do next.
import type { FileEntry } from '@hlabs/api';
import { formatBytes } from '@hlabs/shared';
import { Button, ScrollPane } from '@hlabs/ui';
import type { FileAccent } from '@hlabs/ui/files';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { errorCode, errorData, pageQuery } from '../lib/error-copy';
import { useIsDesktop } from '../lib/use-media';
import { useTRPC } from '../lib/trpc';
import { Breadcrumb } from './breadcrumb';
import { FileGrid } from './file-grid';
import { HOME } from './places';

export interface FilesMe {
  role: 'admin' | 'member';
  displayName: string;
  canSeeShared: boolean;
  accent: FileAccent;
}

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

/** The whole folder: pages of 200 are fetched one after another until it's all here. */
export function useFolder(path: string) {
  const trpc = useTRPC();
  const q = useInfiniteQuery({
    ...trpc.files.list.infiniteQueryOptions({ path }, { getNextPageParam: (p) => p.nextCursor ?? undefined }),
    ...pageQuery,
    retry: false,
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
  children,
}: {
  path: string;
  me: FilesMe;
  /** New folder, Upload … for this place (they know whether it's read only). */
  toolbar?: (place: Listing['place']) => ReactNode;
  /** The search field; it replaces the folder with results while there's a query. */
  search?: ReactNode;
  focusPath?: string | null;
  onOpenFile: (entry: FileEntry, items: FileEntry[]) => void;
  /** A drive that can't be reached: mount it again (US-FILE-12). */
  onRetryDrive?: (driveId: string) => Promise<void>;
  /** Shown instead of the folder (search results). */
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const { query, listing, items } = useFolder(path);
  const open = (e: FileEntry) =>
    e.kind === 'folder' ? void navigate({ to: '/files', search: { path: e.path } }) : onOpenFile(e, items);

  let body: ReactNode;
  if (children) {
    body = children;
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
              onClick={async () => {
                if (driveId && onRetryDrive) await onRetryDrive(driveId).catch(() => {});
                await query.refetch();
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
    body = <div aria-busy="true" aria-label={copy.loading} className="flex-1" />;
  } else if (items.length === 0) {
    body = <Message title={copy.emptyFolder} body={listing.place.readOnly ? undefined : copy.emptyWritable} />;
  } else {
    const last = listing.crumbs[listing.crumbs.length - 1];
    body = (
      <FileGrid
        items={items}
        label={last?.name ?? copy.areaNames[last?.path ?? ''] ?? copy.title}
        accent={me.accent}
        focusPath={focusPath}
        onOpen={open}
        openOnClick={!desktop}
      />
    );
  }

  const footer =
    listing && !children ? (
      <footer className="flex flex-wrap items-center justify-between gap-2 px-7 pt-2 pb-5 text-caption text-ink-muted">
        <span>{copy.footer(copy.items(listing.count), formatBytes(listing.filesBytes))}</span>
        <span>{footerRight(listing.place, me)}</span>
      </footer>
    ) : null;

  const header = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">{listing ? <Breadcrumb crumbs={listing.crumbs} /> : null}</div>
      <div className="flex flex-wrap items-center gap-2 max-md:w-full">
        {search}
        {listing && toolbar ? toolbar(listing.place) : null}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ScrollPane
        className="min-h-0 flex-1"
        header={header}
        headerClassName="px-7 pt-6 pb-4 max-md:px-0 max-md:pt-0"
        scrollClassName="mr-2 max-md:mr-0"
        bodyClassName="flex min-h-full flex-col px-5 pb-5 max-md:px-0"
      >
        {body}
      </ScrollPane>
      {footer}
    </div>
  );
}
