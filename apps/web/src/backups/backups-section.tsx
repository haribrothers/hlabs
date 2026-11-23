// Settings › Backups (BackupsOverview, US-BKP-01…04, US-BKP-23): when the last backup ran and what it covers, the
// destinations, the schedule and the recent runs, with "Restore…" and "Back up now" beside the title (on a phone,
// in the card, US-PHONE-26). Live: job.progress moves the running backup, backup.run and job.finished refresh the page.
import { AlertTriangle, Check, Clock, iconDefaults } from '@hlabs/icons';
import { formatBytes, isFeatureEnabled } from '@hlabs/shared';
import { Badge, BarChart, Button, List, ListRow, Progress, cn } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { backupsCopy as copy } from '../copy/backups';
import { handledGlobally, pageQuery, showErrorToast } from '../lib/error-copy';
import { timeAgo } from '../lib/relative-time';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { useIsDesktop } from '../lib/use-media';
import { useNow } from '../lib/use-now';
import { AddDestinationDialog } from './add-destination-dialog';
import { EditDestinationDialog } from './edit-destination-dialog';
import { dayTime, destinationLine, includedWords, nextLine, retentionWords, runLine, scheduleWords } from './format';
import { IncludedDialog } from './included-dialog';
import { PhoneBackups } from './phone-backups';
import { RestoreFlow } from './restore-flow';

const ICON = 'size-12';

/** Backups' data, kept current from the event stream. */
export function useBackupsOverview() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.backups.overview.queryKey();
  useEventStream((event) => {
    if (event.type === 'job.progress' && event.data.kind === 'backup') {
      queryClient.setQueryData(key, (old) =>
        old
          ? {
              ...old,
              running: { jobId: event.data.jobId, progress: event.data.progress, message: event.data.message },
            }
          : old,
      );
    }
    if (
      event.type === 'backup.run' ||
      (event.type === 'job.finished' && (event.data.kind === 'backup' || event.data.kind === 'restore')) ||
      (event.type === 'job.progress' && event.data.kind === 'restore' && event.data.progress === 0)
    ) {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: trpc.backups.listRuns.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.backups.destinations.list.queryKey() });
    }
  });
  return useQuery({ ...trpc.backups.overview.queryOptions(), ...pageQuery });
}

/** "Back up now" (US-BKP-04): starts the run, then follows it; the toast says it started. */
function useBackUpNow() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.backups.runNow.mutate(),
    onSuccess: ({ jobId }) => {
      showToast({ tone: 'success', title: copy.started });
      queryClient.setQueryData(trpc.backups.overview.queryKey(), (old) =>
        old && !old.running ? { ...old, running: { jobId, progress: 0, message: null } } : old,
      );
    },
    onError: (err) => {
      if (!handledGlobally(err)) showErrorToast(err);
      void queryClient.invalidateQueries({ queryKey: trpc.backups.overview.queryKey() });
    },
  });
}

/** Beside the title on desktop: "Restore…" and "Back up now". The restore flow lives here too. */
export function BackupsActions() {
  const overview = useBackupsOverview().data;
  const backUp = useBackUpNow();
  const desktop = useIsDesktop();
  const [restoring, setRestoring] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const restoreJob = overview?.restoring?.jobId ?? null;
  // A restore that's running when Backups opens shows its progress again, until it's hidden (US-BKP-20).
  const showRestore = restoring || (restoreJob !== null && restoreJob !== seen);
  if (!overview) return null;
  const none = overview.destinations.length === 0;
  const blocked = overview.blockedBy !== null;
  const running = overview.running;
  return (
    <>
      {desktop ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={none || blocked}
            title={blocked ? copy.waitForTask : undefined}
            onClick={() => setRestoring(true)}
          >
            {copy.restore}
          </Button>
          <Button
            variant={none ? 'secondary' : 'primary'}
            size="sm"
            disabled={none || blocked || !!running}
            busy={backUp.isPending}
            title={blocked ? copy.waitForTask : none ? copy.addFirst : undefined}
            onClick={() => backUp.mutate()}
          >
            {running ? copy.backingUp(running.progress) : copy.backUpNow}
          </Button>
        </div>
      ) : null}
      {showRestore ? (
        <RestoreFlow
          destinations={overview.destinations}
          jobId={restoreJob}
          onClose={() => {
            setRestoring(false);
            setSeen(restoreJob);
          }}
        />
      ) : null}
    </>
  );
}

function StatusIcon({ tone }: { tone: 'ok' | 'failed' | 'none' }) {
  const Icon = tone === 'ok' ? Check : tone === 'failed' ? AlertTriangle : Clock;
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-pill',
        ICON,
        tone === 'ok'
          ? 'bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-success'
          : tone === 'failed'
            ? 'bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-danger'
            : 'bg-surface-control text-ink',
      )}
    >
      <Icon {...iconDefaults} className="size-6" />
    </span>
  );
}

export function BackupsSection() {
  const trpc = useTRPC();
  const now = useNow().getTime();
  const desktop = useIsDesktop();
  const query = useBackupsOverview();
  const plan = useQuery({ ...trpc.backups.plan.get.queryOptions(), retry: false });
  const runs = useQuery({ ...trpc.backups.listRuns.queryOptions({ limit: 5 }), retry: false });
  const backUp = useBackUpNow();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [including, setIncluding] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const o = query.data;
  if (!o) return null;

  const none = o.destinations.length === 0;
  const last = o.lastRun;
  const failed = last?.status === 'failed';
  const details = isFeatureEnabled('backupRunDetail');
  const included = plan.data ? includedWords(o.included.apps, plan.data.include.folders) : null;
  const next = nextLine(o.nextRunAt, o.scheduleEnabled, now);
  const editingDest = o.destinations.find((d) => d.id === editing) ?? null;
  const chart = o.chart.map((r) => ({
    label: dayTime(r.startedAt, now),
    value: r.bytesAdded ?? 0,
    ...(r.status === 'failed' ? { status: 'failed' as const, statusText: copy.runStatus.failed } : {}),
  }));
  // A failed run is drawn full height (US-BKP-03).
  const peak = Math.max(1, ...chart.map((c) => c.value));
  const bars = chart.map((c) => (c.status === 'failed' ? { ...c, value: peak } : c));

  const dialogs = (
    <>
      {adding ? <AddDestinationDialog onClose={() => setAdding(false)} /> : null}
      {editingDest ? <EditDestinationDialog destination={editingDest} onClose={() => setEditing(null)} /> : null}
      {including ? <IncludedDialog onClose={() => setIncluding(false)} /> : null}
      {restoring ? (
        <RestoreFlow
          destinations={o.destinations}
          jobId={o.restoring?.jobId ?? null}
          onClose={() => setRestoring(false)}
        />
      ) : null}
    </>
  );
  if (!desktop)
    return (
      <>
        <PhoneBackups
          o={o}
          runs={runs.data?.runs ?? []}
          now={now}
          backingUp={backUp.isPending}
          details={details}
          onBackUp={() => backUp.mutate()}
          onAdd={() => setAdding(true)}
          onEdit={setEditing}
          onIncluded={() => setIncluding(true)}
          onRestore={() => setRestoring(true)}
        />
        {dialogs}
      </>
    );

  const title = none
    ? copy.noBackups
    : failed
      ? copy.lastFailed(dayTime(last.startedAt, now))
      : o.lastSuccessAt
        ? copy.lastBackup(timeAgo(o.lastSuccessAt, now))
        : copy.noBackups;

  return (
    <div className="flex flex-col gap-7">
      <section
        aria-label={copy.noBackups === title ? copy.noBackups : title}
        className="hl-glass hl-glass-2 flex flex-col gap-4 rounded-lg p-5 md:flex-row md:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <StatusIcon tone={none || !last ? 'none' : failed ? 'failed' : 'ok'} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="m-0 flex flex-wrap items-center gap-2 text-title-3">
              <span className={cn(failed && 'text-danger')}>{title}</span>
              {o.overdue ? <Badge tone="warning">{copy.overdue}</Badge> : null}
            </p>
            <p className="m-0 text-body-sm text-ink-muted">
              {none ? (
                copy.noBackupsBody
              ) : (
                <>
                  {included ? (
                    <button
                      type="button"
                      onClick={() => setIncluding(true)}
                      className="hl-focus cursor-pointer rounded-xs border-0 bg-transparent p-0 font-sans text-body-sm font-semibold text-accent-link"
                    >
                      {included}
                    </button>
                  ) : null}
                  {included ? ' · ' : null}
                  {next}
                  {o.included.notBackedUp ? ` · ${copy.notBackedUp(o.included.notBackedUp)}` : null}
                </>
              )}
            </p>
          </div>
          {failed && details ? (
            <Button variant="secondary" size="sm">
              {copy.details}
            </Button>
          ) : null}
        </div>
        {none ? (
          <Button onClick={() => setAdding(true)}>{copy.addDestination}</Button>
        ) : bars.length ? (
          <div className="w-full md:w-44">
            <BarChart
              compact
              data={bars}
              title={copy.chartTitle}
              valueLabel={copy.dataChanged}
              formatValue={formatBytes}
              height={40}
              width={176}
            />
          </div>
        ) : null}
      </section>

      {none ? null : (
        <List label={copy.destinations}>
          {o.destinations.map((d) => (
            <ListRow
              key={d.id}
              title={
                <>
                  {d.name} · <span className="font-mono text-body-sm">{d.location}</span>
                </>
              }
              subtitle={destinationLine(d)}
              trailing={
                <span className="flex shrink-0 items-center gap-3">
                  <Badge tone={d.status === 'ok' ? 'success' : d.status === 'unreachable' ? 'danger' : 'warning'}>
                    {copy.status[d.status]}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={copy.editFor(d.name)}
                    onClick={() => setEditing(d.id)}
                  >
                    {copy.edit}
                  </Button>
                </span>
              }
            />
          ))}
          <ListRow
            title={
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="hl-focus cursor-pointer rounded-xs border-0 bg-transparent p-0 font-sans text-body font-semibold text-accent-link"
              >
                {copy.addDestination}
              </button>
            }
            subtitle={o.destinations.some((d) => d.offsite) ? undefined : copy.offsiteHint}
          />
        </List>
      )}

      <List label={copy.schedule}>
        <ListRow
          title={scheduleWords(o.plan.scheduleCron)}
          subtitle={`${retentionWords(o.plan.retention)}${none ? ` · ${copy.startsOnceAdded}` : ''}`}
          trailing={
            isFeatureEnabled('backupSchedule') ? (
              <Button variant="secondary" size="sm">
                {copy.change}
              </Button>
            ) : undefined
          }
        />
      </List>

      {runs.data?.runs.length ? (
        <List label={copy.recentRuns}>
          {runs.data.runs.map((r) =>
            r.status === 'running' ? (
              <ListRow
                key={r.id}
                title={copy.now}
                subtitle={copy.runningLine(o.running?.progress ?? 0)}
                trailing={<span className="text-body-sm font-semibold text-accent-link">{copy.runStatus.running}</span>}
                below={
                  <Progress
                    value={o.running?.progress ?? 0}
                    aria-label={copy.runningLine(o.running?.progress ?? 0)}
                    className="min-w-0"
                  />
                }
              />
            ) : (
              <ListRow
                key={r.id}
                title={dayTime(r.startedAt, now)}
                subtitle={runLine(r)}
                trailing={
                  <span className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        'text-body-sm font-semibold',
                        r.status === 'failed' ? 'text-danger' : 'text-success',
                      )}
                    >
                      {copy.runStatus[r.status]}
                    </span>
                    {r.status === 'failed' && details ? (
                      <Button variant="secondary" size="sm">
                        {copy.details}
                      </Button>
                    ) : null}
                  </span>
                }
              />
            ),
          )}
        </List>
      ) : null}

      {dialogs}
    </div>
  );
}
