// Trash (US-FILE-17, FilesTrash): "Trash", "Restore all" and "Empty trash", the 30-day note, then this person's items
// newest first: where each came from and when, the days left (amber at 7 or fewer) and Restore. Restoring puts an
// item back where it was; a drive that isn't connected says so and the item stays. An empty Trash says so.
import { Clock, iconDefaults, RotateCcw } from '@hlabs/icons';
import { fileKindOf, FileIcon } from '@hlabs/icons/files';
import { formatBytes } from '@hlabs/shared';
import { Button, ScrollPane } from '@hlabs/ui';
import type { FileAccent } from '@hlabs/ui/files';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { filesCopy as copy } from '../copy/files';
import { confirm } from '../lib/confirm';
import { codeLine, pageQuery } from '../lib/error-copy';
import { useEventStream } from '../lib/use-event-stream';
import { showToast } from '../lib/toasts';
import { useIsDesktop } from '../lib/use-media';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { daysLeft, deletedWhen } from './trash-format';

export function useTrash() {
  const trpc = useTRPC();
  const q = useInfiniteQuery({
    ...trpc.files.listTrash.infiniteQueryOptions(
      { limit: 200 },
      { getNextPageParam: (p) => p.nextCursor ?? undefined },
    ),
    ...pageQuery,
    retry: false,
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return { query: q, items: q.data?.pages.flatMap((p) => p.items) ?? [] };
}

type Failure = { name: string; hlabsCode: string; location: string | null };

/** What a failed restore says: a drive that isn't connected by name, else what went wrong. */
export function failureLine(f: Failure): string {
  if (f.hlabsCode === 'NAS_UNREACHABLE' && f.location) return copy.driveNotConnected(f.location);
  return `${copy.couldntRestore(f.name)}. ${codeLine(f.hlabsCode)}`;
}

export function TrashView({ accent }: { accent: FileAccent }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const desktop = useIsDesktop();
  const { query, items } = useTrash();
  const [now] = useState(() => Date.now());
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.files.listTrash.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.files.list.pathKey() }),
    ]);

  // A big Trash empties as a job: the list follows it.
  useEventStream((event) => {
    if (event.type === 'job.finished' && event.data.kind === 'empty_trash') {
      void refresh();
      void queryClient.invalidateQueries({ queryKey: trpc.storage.summary.queryKey() });
      showToast({ tone: event.data.state === 'succeeded' ? 'success' : 'danger', title: copy.trashEmptied });
    }
  });

  /** "Empty trash?" with how much goes; only this person's items (US-FILE-18). */
  const emptyTrash = async () => {
    const bytes = items.reduce((n, i) => n + i.size, 0);
    let job = false;
    const done = await confirm({
      title: copy.emptyTrashTitle,
      body: copy.emptyTrashBody(items.length, formatBytes(bytes)),
      confirmLabel: copy.emptyTrash,
      tone: 'danger',
      onConfirm: async () => {
        const res = await client.files.emptyTrash.mutate({});
        job = 'jobId' in res;
      },
    });
    if (!done) return;
    await refresh();
    void queryClient.invalidateQueries({ queryKey: trpc.storage.summary.queryKey() });
    showToast(job ? { tone: 'neutral', title: copy.emptyingTrash } : { tone: 'success', title: copy.trashEmptied });
  };

  const restore = useMutation({
    mutationFn: (ids?: string[]) => client.files.restoreFromTrash.mutate(ids ? { ids } : {}),
    onSuccess: async (res, ids) => {
      await refresh();
      for (const f of res.failed) showToast({ tone: 'danger', title: failureLine(f) });
      if (!res.restored.length) return;
      const one = ids?.length === 1 ? items.find((i) => i.id === ids[0]) : undefined;
      showToast({
        tone: 'success',
        title: one ? copy.restoredOne(one.name) : copy.restoredMany(res.restored.length),
      });
    },
  });

  const empty = query.isSuccess && items.length === 0;
  const header = (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-title-2">{copy.trashTitle}</h1>
        <Button
          variant="secondary"
          size="sm"
          disabled={empty || !query.isSuccess}
          busy={restore.isPending && restore.variables === undefined}
          onClick={() => restore.mutate(undefined)}
        >
          {copy.restoreAll}
        </Button>
        <Button variant="destructive" size="sm" disabled={empty || !query.isSuccess} onClick={() => void emptyTrash()}>
          {copy.emptyTrash}
        </Button>
      </div>
      <p className="m-0 text-body-sm text-ink-muted">{copy.trashNote}</p>
    </div>
  );

  const body = empty ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
      <p className="m-0 text-headline">{copy.trashEmpty}</p>
    </div>
  ) : !query.isSuccess ? (
    <div role="status" aria-busy="true" aria-label={copy.loadingTrash} className="flex-1" />
  ) : (
    <ul aria-label={copy.trashTitle} className="m-0 list-none overflow-hidden rounded-lg bg-surface-row p-0">
      {items.map((item) => {
        const left = daysLeft(item.deletedAt, now);
        return (
          <li key={item.id} className="flex items-center gap-3.5 border-t border-hairline px-4.5 py-3 first:border-t-0">
            {item.kind === 'folder' ? (
              <FileIcon folder="plain" accent={accent} size={34} />
            ) : (
              <FileIcon kind={fileKindOf(item.name, item.mime)} name={item.name} mime={item.mime} size={34} />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-body">{item.name}</span>
              <span className="text-body-sm text-ink-muted">
                {copy.trashFrom(item.from, deletedWhen(item.deletedAt, now))}
              </span>
              {desktop ? null : (
                <span className={`text-body-sm ${left <= 7 ? 'font-semibold text-warning' : 'text-ink-muted'}`}>
                  {copy.daysLeft(left)}
                </span>
              )}
            </div>
            {desktop ? (
              <span
                className={`w-24 shrink-0 text-body-sm ${left <= 7 ? 'font-semibold text-warning' : 'text-ink-muted'}`}
              >
                {copy.daysLeft(left)}
              </span>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              aria-label={copy.restoreLabel(item.name)}
              busy={restore.isPending && restore.variables?.[0] === item.id}
              onClick={() => restore.mutate([item.id])}
            >
              {copy.restore}
            </Button>
          </li>
        );
      })}
    </ul>
  );

  if (!desktop) {
    // PhoneRedesignA_FilesTrash: "Trash" with Restore all and Empty trash beside it, the note, then an inset list
    // whose rows restore with a round button.
    const busyAll = restore.isPending && restore.variables === undefined;
    return (
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-4">
          <h1 className="hl-p-sec-title flex-1">{copy.trashTitle}</h1>
          <button
            type="button"
            className="hl-p-tlink hl-focus"
            disabled={empty || !query.isSuccess || busyAll}
            aria-busy={busyAll || undefined}
            onClick={() => restore.mutate(undefined)}
          >
            {copy.restoreAll}
          </button>
          <button
            type="button"
            className="hl-p-tlink hl-focus"
            data-danger=""
            disabled={empty || !query.isSuccess}
            onClick={() => void emptyTrash()}
          >
            {copy.emptyTrash}
          </button>
        </div>
        <p className="m-0 mb-3 text-body-sm text-ink-muted">{copy.trashNote}</p>
        {empty || !query.isSuccess ? (
          body
        ) : (
          <ul aria-label={copy.trashTitle} className="hl-p-group">
            {items.map((item) => {
              const left = daysLeft(item.deletedAt, now);
              const busy = restore.isPending && restore.variables?.[0] === item.id;
              return (
                <li key={item.id} className="hl-p-row hl-p-file">
                  <span aria-hidden className="hl-p-file-icon">
                    {item.kind === 'folder' ? (
                      <FileIcon folder="plain" accent={accent} size={36} />
                    ) : (
                      <FileIcon kind={fileKindOf(item.name, item.mime)} name={item.name} mime={item.mime} size={36} />
                    )}
                  </span>
                  <span className="hl-p-row-text">
                    <span className="hl-p-row-title truncate">{item.name}</span>
                    <span className="hl-p-row-sub">{copy.trashFrom(item.from, deletedWhen(item.deletedAt, now))}</span>
                    <span className={`hl-p-row-sub ${left <= 7 ? 'hl-p-days font-semibold text-warning' : ''}`}>
                      {left <= 7 ? <Clock aria-hidden {...iconDefaults} /> : null}
                      {copy.daysLeft(left)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="hl-p-round"
                    aria-label={copy.restoreLabel(item.name)}
                    aria-busy={busy || undefined}
                    disabled={busy}
                    onClick={() => restore.mutate([item.id])}
                  >
                    <RotateCcw aria-hidden {...iconDefaults} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
  return (
    <ScrollPane
      className="min-h-0 flex-1"
      header={header}
      headerClassName="px-7 pt-6 pb-4"
      scrollClassName="mr-2"
      bodyClassName="flex min-h-full flex-col px-7 pb-5"
    >
      {body}
    </ScrollPane>
  );
}
