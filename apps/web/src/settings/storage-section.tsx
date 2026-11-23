// Settings › Storage (SettingsStorage): what is using this computer's disk (US-SYS-11), where hlabs keeps data and
// which drives are connected (US-SYS-12), and cleaning up unused app images (US-SYS-13) and everyone's trash
// (US-SYS-14). Sizes are decimal (GB = 10^9 bytes) with at most one decimal.
import type { AppRouter } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';
import { formatBytes, isFeatureEnabled } from '@hlabs/shared';
import { Badge, Button, List, ListRow, StackedBar } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { storageCopy as copy } from '../copy/storage';
import { confirm } from '../lib/confirm';
import { showErrorToast } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { ConnectDriveDialog } from '../files/connect-drive-dialog';
import { DriveEvents } from '../files/sidebar';

type Outputs = inferRouterOutputs<AppRouter>;
type Summary = Outputs['storage']['summary'];
type Location = Outputs['storage']['locations']['list']['locations'][number];

/** "Low disk space" under a tenth free or 10 GB, as SysDialogs' notification. */
export const LOW_SPACE_SHARE = 0.1;
export const LOW_SPACE_BYTES = 10e9;
/** Drives are asked about this often while the page is open (a drive coming or going shows within it). */
export const DRIVES_POLL_MS = 10_000;
/** How often a running clean-up job is asked about. */
const JOB_POLL_MS = 1_000;

export function isLowSpace(s: Pick<Summary, 'totalBytes' | 'freeBytes'>): boolean {
  return s.totalBytes > 0 && (s.freeBytes < LOW_SPACE_BYTES || s.freeBytes / s.totalBytes < LOW_SPACE_SHARE);
}

/** A path or address: monospaced, and broken anywhere so a long one wraps on a phone. */
const mono = (text: string) => <span className="font-mono break-all">{text}</span>;

/** The disk: its name, free space and a bar of what uses it (US-SYS-11). */
function DiskCard() {
  const trpc = useTRPC();
  const summary = useQuery({ ...trpc.storage.summary.queryOptions(), retry: false });
  if (summary.isError) {
    return (
      <div role="alert" className="hl-list-box flex items-center gap-3 px-4.5 py-4 text-body">
        <span className="flex-1">{copy.loadFailed}</span>
        <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
          {copy.tryAgain}
        </Button>
      </div>
    );
  }
  if (!summary.data) {
    return (
      <div role="status" aria-label={copy.loading} className="hl-list-box flex flex-col gap-3 px-4.5 py-4">
        <div className="hl-skeleton h-5 w-56 rounded-pill" />
        <div className="hl-skeleton h-2.5 w-full rounded-pill" />
        <div className="hl-skeleton h-3 w-80 max-w-full rounded-pill" />
      </div>
    );
  }
  const s = summary.data;
  const other = Math.max(0, s.systemBytes - s.hlabsBytes - s.backupCacheBytes);
  return (
    <section aria-labelledby="storage-disk" className="hl-list-box flex flex-col gap-3 px-4.5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="storage-disk" className="m-0 flex-1 text-headline">
          {copy.diskLabel(s.diskKind ? copy.diskKind[s.diskKind] : null)}
        </h2>
        {isLowSpace(s) ? <Badge tone="warning">{copy.lowSpace}</Badge> : null}
        <span className="text-caption text-ink-muted">
          {copy.freeOf(formatBytes(s.freeBytes), formatBytes(s.totalBytes))}
        </span>
      </div>
      <StackedBar
        label={copy.chartLabel}
        total={s.totalBytes}
        formatValue={formatBytes}
        segments={[
          { label: copy.apps, value: s.appsBytes },
          { label: copy.files, value: s.filesBytes },
          { label: copy.backupCache, value: s.backupCacheBytes },
          { label: copy.hlabs, value: s.hlabsBytes },
          // The rest of the disk (the system, other programs): left out of the legend when there's none.
          ...(other > 0 ? [{ label: copy.other, value: other }] : []),
        ]}
      />
    </section>
  );
}

/** Where Home folders, Shared and media live, and where apps keep their data (US-SYS-12). */
function DataLocation({
  root,
  appDataPath,
  shippedPhase,
}: {
  root: Location | null;
  appDataPath: string;
  shippedPhase?: number;
}) {
  return (
    <List label={copy.dataLocation}>
      {root ? (
        <ListRow
          title={mono(root.address ?? root.displayPath)}
          subtitle={copy.rootNote}
          trailing={
            // Moving all data ships in phase 9 (D-036).
            isFeatureEnabled('moveAllData', shippedPhase) ? (
              <Button variant="secondary" size="sm">
                {copy.moveData}
              </Button>
            ) : null
          }
        />
      ) : null}
      <ListRow title={mono(appDataPath)} subtitle={`${copy.appData} · ${copy.appDataNote}`} />
    </List>
  );
}

/** "smb://nas.local/Media · connected · used by Jellyfin" */
function driveLine(d: Location): ReactNode {
  if (d.kind === 'external' || d.kind === 'local') {
    return d.status === 'ok' ? `${copy.externalDrive} · ${d.displayPath}` : copy.externalAway;
  }
  const state =
    d.status === 'ok' ? copy.connectedNote : d.status === 'ejected' ? copy.disconnectedNote : copy.offlineNote;
  return (
    <>
      {mono(d.address ?? d.displayPath)}
      {` · ${state}`}
      {d.usedBy.length ? ` · ${copy.usedBy(d.usedBy)}` : null}
    </>
  );
}

function Drives({ drives }: { drives: Location[] }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.storage.locations.list.queryKey() });

  const disconnect = async (d: Location) => {
    const ok = await confirm({
      title: copy.disconnectTitle(d.name),
      body: d.usedBy.length ? `${copy.appsWillStop(d.usedBy)} ${copy.filesKept}` : copy.filesKept,
      confirmLabel: copy.disconnect,
      onConfirm: () => client.storage.locations.eject.mutate({ locationId: d.id }),
    });
    if (!ok) return;
    await refresh();
    void queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
    showToast({ tone: 'success', title: copy.disconnected(d.name) });
  };

  return (
    <List label={copy.drives}>
      {drives.map((d) => {
        const network = d.kind === 'smb' || d.kind === 'nfs';
        const on = d.status === 'ok';
        return (
          <ListRow
            key={d.id}
            title={d.name}
            subtitle={driveLine(d)}
            trailing={
              <span className="flex items-center gap-3">
                {/* The word says it too, not only the colour. */}
                <Badge tone={on ? 'success' : 'neutral'}>{on ? copy.connected : copy.offline}</Badge>
                {network && on ? (
                  <Button variant="secondary" size="sm" onClick={() => void disconnect(d)}>
                    {copy.disconnect}
                  </Button>
                ) : null}
              </span>
            }
          />
        );
      })}
      <div className="hl-list-row">
        <button
          type="button"
          className="hl-focus rounded-xs border-0 bg-transparent p-0 text-body font-semibold text-accent-link"
          onClick={() => setConnecting(true)}
        >
          {copy.connectDrive}
        </button>
      </div>
      {connecting ? (
        <ConnectDriveDialog
          onClose={() => setConnecting(false)}
          onConnected={() => {
            setConnecting(false);
            void refresh();
          }}
        />
      ) : null}
    </List>
  );
}

/** Unused app images (US-SYS-13) and everyone's trash (US-SYS-14). */
function CleanUp() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const summary = useQuery({ ...trpc.storage.summary.queryOptions(), retry: false });
  const refreshSummary = () => queryClient.invalidateQueries({ queryKey: trpc.storage.summary.queryKey() });
  const [emptyingTrash, setEmptyingTrash] = useState(false);

  /** Asks about a job every second until it ends (the button keeps its spinner meanwhile). */
  const finished = async (jobId: string) => {
    for (;;) {
      const job = await client.jobs.get.query({ jobId });
      if (job.state === 'succeeded' || job.state === 'failed' || job.state === 'cancelled') return job;
      await new Promise((r) => setTimeout(r, JOB_POLL_MS));
    }
  };

  const prune = useMutation({
    mutationFn: async () => finished((await client.storage.pruneImages.mutate()).jobId),
    onSuccess: (job) => {
      void refreshSummary();
      if (job.state !== 'succeeded') {
        showToast({ tone: 'danger', title: copy.freeFailed });
        return;
      }
      // The amount the job really freed, which may be less than offered (an image came into use meanwhile).
      let freed = 0;
      try {
        freed = (JSON.parse(job.message ?? '{}') as { freedBytes?: number }).freedBytes ?? 0;
      } catch {
        // No amount: say 0 rather than guess.
      }
      showToast({ tone: 'success', title: copy.freed(formatBytes(freed)) });
    },
    onError: (err) => showErrorToast(err),
  });

  const s = summary.data;
  const reclaimable = s?.reclaimableImageBytes ?? 0;
  const busyPruning = prune.isPending;
  const trashCount = s?.trashCount ?? 0;

  const emptyTrash = async () => {
    const bytes = s?.trashBytes ?? 0;
    let job: string | null = null;
    const ok = await confirm({
      title: copy.emptyTitle,
      body: copy.emptyBody(formatBytes(bytes)),
      confirmLabel: copy.empty,
      tone: 'danger',
      onConfirm: async () => {
        const res = await client.files.emptyTrash.mutate({ allUsers: true });
        if ('jobId' in res) job = res.jobId;
      },
    });
    if (!ok) return;
    void queryClient.invalidateQueries({ queryKey: trpc.files.listTrash.pathKey() });
    if (job) {
      // A big trash empties as a job: said when it ends.
      showToast({ tone: 'neutral', title: copy.emptying });
      setEmptyingTrash(true);
      const done = await finished(job).catch(() => null);
      setEmptyingTrash(false);
      await refreshSummary();
      showToast(
        done?.state === 'succeeded'
          ? { tone: 'success', title: copy.freed(formatBytes(bytes)) }
          : { tone: 'danger', title: copy.emptyFailed },
      );
      return;
    }
    await refreshSummary();
    showToast({ tone: 'success', title: copy.freed(formatBytes(bytes)) });
  };

  return (
    <List label={copy.cleanUp}>
      <ListRow
        title={copy.images}
        subtitle={copy.imagesNote}
        trailing={
          <Button
            variant="secondary"
            size="sm"
            busy={busyPruning}
            disabled={!s || reclaimable === 0}
            onClick={() => prune.mutate()}
          >
            {busyPruning ? copy.freeing : reclaimable > 0 ? copy.free(formatBytes(reclaimable)) : copy.nothingToClean}
          </Button>
        }
      />
      <ListRow
        title={copy.trash}
        subtitle={
          s && trashCount > 0 ? `${copy.trashNote} · ${copy.trashSize(formatBytes(s.trashBytes))}` : copy.trashNote
        }
        trailing={
          <Button
            variant="secondary"
            size="sm"
            busy={emptyingTrash}
            disabled={!s || trashCount === 0}
            onClick={() => void emptyTrash()}
          >
            {copy.emptyNow}
          </Button>
        }
      />
    </List>
  );
}

export function StorageSection({ shippedPhase }: { shippedPhase?: number }) {
  const trpc = useTRPC();
  // Every 10 s while open (the daemon checks the drives as often then), and at once on storage.locationChanged.
  const locations = useQuery({
    ...trpc.storage.locations.list.queryOptions(),
    retry: false,
    refetchInterval: DRIVES_POLL_MS,
  });
  const all = locations.data?.locations ?? [];
  const root = all.find((l) => l.isRoot) ?? null;
  const drives = all.filter((l) => !l.isRoot);
  return (
    <div className="flex flex-col gap-6">
      <DriveEvents />
      <DiskCard />
      {locations.data ? (
        <>
          <DataLocation root={root} appDataPath={locations.data.appDataPath} shippedPhase={shippedPhase} />
          <Drives drives={drives} />
        </>
      ) : null}
      <CleanUp />
    </div>
  );
}
