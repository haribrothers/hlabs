// Restore (RestoreChooseDest, RestoreFlow, RestoreConfirm, RestoreProgress; US-BKP-17…22): where from (skipped when
// only one destination is healthy), which restore point, which apps and folders and how (replace, or a copy in
// Home › Restored), the admin's password, then each step as it happens: Stop → Safety copy → Copy → Start (D-024).
// "Cancel restore" shows until swap-in; Hide leaves it running and a notification says when it's done.
import { CircleCheck, CircleX, Circle, iconDefaults, LoaderCircle } from '@hlabs/icons';
import { formatBytes, formatDuration } from '@hlabs/shared';
import { Badge, Button, ModalDialog, Progress, cn } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { backupsCopy as copy } from '../copy/backups';
import { codeLine, errorCode, errorData, errorLine, showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { useNow } from '../lib/use-now';
import { ConfirmWithPassword, passwordStepError } from '../settings/confirm-with-password';
import { dayTimeLower, pointLabel, possessiveDay } from './format';

interface Destination {
  id: string;
  name: string;
  location: string;
  status: string;
  restorePoints: number | null;
  latestAt: number | null;
}

type Step = 'where' | 'what' | 'confirm' | 'progress';
type Item = { kind: 'app' | 'folder'; id: string; label: string; sizeBytes: number | null; installed: boolean };

const itemKey = (i: { kind: string; id: string }) => `${i.kind}:${i.id}`;

export function RestoreFlow({
  destinations,
  jobId: runningJob,
  onClose,
}: {
  destinations: Destination[];
  /** A restore already running: straight to its progress. */
  jobId: string | null;
  onClose: () => void;
}) {
  const healthy = destinations.filter((d) => d.status !== 'unreachable');
  const skipWhere = healthy.length === 1;
  const [step, setStep] = useState<Step>(runningJob ? 'progress' : skipWhere ? 'what' : 'where');
  const [destId, setDestId] = useState<string | null>(skipWhere ? healthy[0]!.id : (healthy[0]?.id ?? null));
  const [jobId, setJobId] = useState<string | null>(runningJob);
  const dest = destinations.find((d) => d.id === destId) ?? null;
  return step === 'progress' && jobId ? (
    <RestoreProgress jobId={jobId} onClose={onClose} />
  ) : (
    <ChooseSteps
      step={step}
      setStep={setStep}
      destinations={destinations}
      dest={dest}
      setDestId={setDestId}
      skipWhere={skipWhere}
      onStarted={(id) => {
        setJobId(id);
        setStep('progress');
      }}
      onClose={onClose}
    />
  );
}

function ChooseSteps({
  step,
  setStep,
  destinations,
  dest,
  setDestId,
  skipWhere,
  onStarted,
  onClose,
}: {
  step: Step;
  setStep: (s: Step) => void;
  destinations: Destination[];
  dest: Destination | null;
  setDestId: (id: string) => void;
  skipWhere: boolean;
  onStarted: (jobId: string) => void;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const now = useNow().getTime();
  const points = useQuery({
    ...trpc.backups.listSnapshots.queryOptions({ destinationId: dest?.id ?? '' }),
    enabled: !!dest && step !== 'where',
    retry: false,
    meta: { inlineErrors: true },
  });
  const [pointId, setPointId] = useState<string | null>(null);
  const point = points.data?.points.find((p) => p.id === pointId) ?? points.data?.points[0] ?? null;
  const items = useQuery({
    ...trpc.backups.getSnapshot.queryOptions({ destinationId: dest?.id ?? '', snapshotId: point?.id ?? '' }),
    enabled: !!dest && !!point,
    retry: false,
    meta: { inlineErrors: true },
  });
  // Ticks belong to a restore point: a new point starts with nothing ticked (US-BKP-18).
  const [ticks, setTicks] = useState<{ pointId: string | null; keys: Set<string> }>({ pointId: null, keys: new Set() });
  const [mode, setMode] = useState<'replace' | 'copy'>('replace');
  const chosen = ticks.pointId === (point?.id ?? null) ? ticks.keys : new Set<string>();
  const setChosen = (keys: Set<string>) => setTicks({ pointId: point?.id ?? null, keys });
  const list: Item[] = items.data?.items ?? [];
  const selectable = list.filter((i) => mode === 'copy' || i.installed);
  const picked = list.filter((i) => chosen.has(itemKey(i)) && (mode === 'copy' || i.installed));
  const everything = mode === 'replace' && list.length > 0 && picked.length === list.length;

  const restore = useMutation({
    mutationFn: (password: string) =>
      client.backups.restore.mutate({
        destinationId: dest!.id,
        snapshotId: point!.id,
        scope: {
          mode,
          apps: picked.filter((i) => i.kind === 'app').map((i) => i.id),
          folders: picked.filter((i) => i.kind === 'folder').map((i) => i.id),
        },
        password,
      }),
    meta: { inlineErrors: true },
    onSuccess: ({ jobId }) => onStarted(jobId),
  });
  const restoreError = (() => {
    if (!restore.isError) return null;
    const code = errorCode(restore.error);
    if (code === 'AUTH_INVALID_PASSWORD' || code === 'AUTH_LOCKED') {
      const e = passwordStepError(restore.error);
      return e.field ? { field: copy.wrongPassword } : e;
    }
    if (code === 'DISK_FULL') {
      const needed = (errorData(restore.error)?.detail as { neededBytes?: number } | null)?.neededBytes ?? 0;
      return { form: copy.notEnoughSpace(formatBytes(needed)) };
    }
    return { form: errorLine(restore.error) };
  })();

  const what = everything ? 'everything' : picked.length === 1 ? picked[0]!.label : `${picked.length} items`;
  const when = point ? dayTimeLower(point.time, now) : '';

  if (step === 'where') {
    return (
      <ModalDialog
        open
        onOpenChange={(o) => (o ? null : onClose())}
        sheetOnPhone
        width="min(640px, 100%)"
        title={
          <span className="flex flex-col gap-1">
            <span className="text-body-sm font-normal text-ink-muted">{copy.step(1)}</span>
            <span>{copy.chooseWhere}</span>
          </span>
        }
        description={copy.chooseWhereBody}
        actions={
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <p className="m-0 text-body-sm text-ink-muted md:mr-auto">{copy.nothingChanges}</p>
            <Button variant="secondary" onClick={onClose}>
              {copy.cancel}
            </Button>
            <Button onClick={() => setStep('what')} disabled={!dest || dest.status === 'unreachable'}>
              {copy.continue}
            </Button>
          </div>
        }
      >
        <div role="radiogroup" aria-label={copy.chooseWhere} className="flex flex-col gap-2">
          {destinations.map((d) => {
            const off = d.status === 'unreachable';
            const on = dest?.id === d.id;
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={off || undefined}
                onClick={() => (off ? null : setDestId(d.id))}
                className={cn(
                  'hl-focus flex min-h-14 w-full items-center gap-3 rounded-lg border-2 border-solid bg-surface-input px-4 py-3 text-left font-sans text-ink',
                  on ? 'border-accent' : 'border-transparent',
                  off ? 'cursor-default opacity-55' : 'cursor-pointer',
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-body font-semibold">
                    {d.name} · <span className="font-mono text-body-sm font-normal">{d.location}</span>
                  </span>
                  <span className="text-body-sm text-ink-muted">
                    {d.restorePoints !== null && d.latestAt !== null
                      ? copy.latest(d.restorePoints, dayTimeLower(d.latestAt, now))
                      : copy.noPoints}
                  </span>
                </span>
                <Badge tone={off ? 'danger' : 'success'}>{off ? copy.notConnected : copy.status.ok}</Badge>
              </button>
            );
          })}
        </div>
      </ModalDialog>
    );
  }

  if (step === 'confirm') {
    const titleText = mode === 'copy' ? copy.confirmCopy(what, when) : copy.confirmReplace(what, when);
    return (
      <ModalDialog
        open
        onOpenChange={(o) => (o || restore.isPending ? null : setStep('what'))}
        role="alertdialog"
        sheetOnPhone
        width="min(540px, 100%)"
        title={titleText}
      >
        <ConfirmWithPassword
          message={
            mode === 'copy'
              ? copy.confirmCopyBody
              : everything
                ? copy.confirmEverythingBody
                : copy.confirmReplaceBody(what)
          }
          confirmLabel={mode === 'copy' ? copy.copyData : copy.replaceData}
          destructive={mode === 'replace'}
          busy={restore.isPending}
          error={restoreError}
          onCancel={() => setStep('what')}
          onConfirm={(password) => restore.mutate(password)}
        />
      </ModalDialog>
    );
  }

  const unreachable = points.isError && errorCode(points.error) === 'BACKUP_DEST_UNREACHABLE';
  return (
    <ModalDialog
      open
      onOpenChange={(o) => (o ? null : onClose())}
      sheetOnPhone
      width="min(720px, 100%)"
      title={
        <span className="flex flex-col gap-1">
          <span className="text-body-sm font-normal text-ink-muted">{copy.step(2)}</span>
          <span>{copy.chooseWhat}</span>
        </span>
      }
      actions={
        <div className="flex w-full flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
          <Button variant="secondary" onClick={() => (skipWhere ? onClose() : setStep('where'))}>
            {skipWhere ? copy.cancel : copy.back}
          </Button>
          <Button onClick={() => setStep('confirm')} disabled={!picked.length}>
            {everything ? copy.restoreEverything : copy.restoreButton}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-ink">
        <div className="grid gap-4 md:grid-cols-2">
          <section aria-labelledby="restore-points" className="flex flex-col gap-2">
            <h3 id="restore-points" className="m-0 text-label">
              {copy.pointFrom(dest?.name ?? '')}
            </h3>
            {unreachable ? (
              <div className="flex flex-col items-start gap-2 rounded-lg bg-surface-input p-4">
                <p role="alert" className="m-0 text-body">
                  {copy.cantReach(dest?.name ?? '')}
                </p>
                <Button variant="secondary" size="sm" onClick={() => void points.refetch()}>
                  {copy.tryAgain}
                </Button>
              </div>
            ) : points.isError ? (
              <p role="alert" className="m-0 text-body-sm text-danger">
                {errorLine(points.error)}
              </p>
            ) : !points.data ? (
              <p role="status" className="m-0 text-body-sm text-ink-muted">
                {copy.loadingPoints}
              </p>
            ) : points.data.points.length === 0 ? (
              <p className="m-0 text-body-sm text-ink-muted">{copy.noPoints}</p>
            ) : (
              <div
                role="radiogroup"
                aria-labelledby="restore-points"
                className="max-h-72 overflow-y-auto rounded-lg bg-surface-input"
              >
                {points.data.points.map((p) => {
                  const on = point?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPointId(p.id)}
                      className={cn(
                        'hl-focus flex min-h-11 w-full cursor-pointer items-center gap-3 border-0 px-4 py-2.5 text-left font-sans text-body text-ink',
                        on ? 'bg-accent-wash' : 'bg-transparent',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'size-4.5 shrink-0 rounded-pill',
                          on ? 'border-[6px] border-solid border-accent' : 'border-2 border-solid border-ink-muted',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{pointLabel(p, now)}</span>
                      {p.bytesChanged !== null ? (
                        <span className="shrink-0 text-body-sm text-ink-muted">
                          {copy.changed(formatBytes(p.bytesChanged))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          <section aria-labelledby="restore-items" className="flex flex-col gap-2">
            <h3 id="restore-items" className="m-0 text-label">
              {copy.appsAndFolders}
            </h3>
            <div className="max-h-72 overflow-y-auto rounded-lg bg-surface-input py-1">
              {list.map((i) => {
                const disabled = mode === 'replace' && !i.installed;
                return (
                  <label
                    key={itemKey(i)}
                    className={cn(
                      'flex min-h-11 items-center gap-3 px-4 py-2 text-body',
                      disabled ? 'cursor-default opacity-55' : 'cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="hl-focus size-4.5 shrink-0 accent-[var(--color-accent)]"
                      aria-label={i.label}
                      disabled={disabled}
                      checked={!disabled && chosen.has(itemKey(i))}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(itemKey(i));
                        else next.delete(itemKey(i));
                        setChosen(next);
                      }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{i.label}</span>
                      {disabled ? (
                        <span className="text-body-sm text-ink-muted">{copy.installFirst(i.label)}</span>
                      ) : null}
                    </span>
                    {i.sizeBytes !== null ? (
                      <span className="shrink-0 text-body-sm text-ink-muted">{formatBytes(i.sizeBytes)}</span>
                    ) : null}
                  </label>
                );
              })}
              {point && !items.data && !items.isError ? (
                <p role="status" className="m-0 px-4 py-2 text-body-sm text-ink-muted">
                  {copy.loadingItems}
                </p>
              ) : null}
              {items.isError ? (
                <p role="alert" className="m-0 px-4 py-2 text-body-sm text-danger">
                  {errorLine(items.error)}
                </p>
              ) : null}
              {selectable.length === 0 && items.data ? (
                <p className="m-0 px-4 py-2 text-body-sm text-ink-muted">{copy.noPoints}</p>
              ) : null}
            </div>
          </section>
        </div>
        <div role="radiogroup" aria-label={copy.howToRestore} className="grid gap-2.5 md:grid-cols-2">
          {(['replace', 'copy'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'hl-focus flex cursor-pointer flex-col items-start gap-1 rounded-lg border-2 border-solid bg-surface-input px-3.5 py-3 text-left font-sans',
                mode === m ? 'border-accent' : 'border-transparent',
              )}
            >
              <span className="text-body font-semibold text-ink">{m === 'replace' ? copy.replace : copy.asCopy}</span>
              <span className="text-body-sm text-ink-muted">
                {m === 'replace'
                  ? copy.replaceLine(point ? possessiveDay(point.time, now) : "the restore point's")
                  : copy.asCopyLine}
              </span>
            </button>
          ))}
        </div>
      </div>
    </ModalDialog>
  );
}

/** Step 3 (RestoreProgress, US-BKP-20…22): from `backups.getRestore`, kept live by job events. */
export function RestoreProgress({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const now = useNow(1_000).getTime();
  const key = trpc.backups.getRestore.queryKey({ jobId });
  const view = useQuery({
    ...trpc.backups.getRestore.queryOptions({ jobId }),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 2_000 : false),
  });
  useEventStream((event) => {
    if ((event.type === 'job.progress' || event.type === 'job.finished') && event.data.jobId === jobId) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  });
  const cancel = useMutation({
    mutationFn: () => client.jobs.cancel.mutate({ jobId }),
    onError: (err) => showErrorToast(err),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const r = view.data;
  const what = useMemo(() => (r ? (r.items.length === 1 ? r.items[0]!.label : null) : null), [r]);
  if (!r) return null;
  const many = r.items.length > 1;
  const label = what ?? `${r.items.length} items`;
  const appName = (id: string | null) => r.items.find((i) => i.id === id)?.label ?? id ?? '';
  const done = r.steps.filter((s) => s.state === 'done').length;
  const copyStep = r.steps.find((s) => s.kind === 'copy');
  const pct =
    r.status === 'succeeded'
      ? 100
      : Math.round(
          ((done +
            (copyStep?.state === 'running' && copyStep.bytesTotal
              ? (copyStep.bytesDone ?? 0) / copyStep.bytesTotal
              : 0)) /
            Math.max(1, r.steps.length)) *
            100,
        );
  const when = dayTimeLower(r.pointTime, now);
  const finished = r.status !== 'running';
  const title =
    r.status === 'succeeded'
      ? copy.restored(label)
      : r.status === 'failed'
        ? copy.didntFinish
        : r.status === 'cancelled'
          ? copy.cancelled
          : many
            ? copy.restoringN(r.items.length)
            : copy.restoring(label);
  const stepText = (s: (typeof r.steps)[number]) => {
    const running = s.state === 'running' || s.state === 'todo';
    switch (s.kind) {
      case 'stop':
        return running ? copy.steps.stopping(appName(s.appId)) : copy.steps.stop(appName(s.appId));
      case 'safety':
        return running ? copy.steps.safetyRunning : copy.steps.safety;
      case 'copy':
        return s.state === 'done'
          ? copy.steps.copy(r.destinationName ?? '')
          : copy.steps.copyRunning(r.destinationName ?? '');
      case 'start':
        return running ? copy.steps.starting(appName(s.appId)) : copy.steps.start(appName(s.appId));
      default:
        return running ? copy.steps.puttingBack : copy.steps.putBack;
    }
  };
  const stepRight = (s: (typeof r.steps)[number]) => {
    if (s.kind === 'copy' && s.bytesTotal) {
      if (s.state === 'failed' || (r.status !== 'running' && s.state !== 'done'))
        return copy.stoppedAt(formatBytes(s.bytesDone ?? 0), formatBytes(s.bytesTotal));
      if (s.state === 'running') return copy.ofBytes(formatBytes(s.bytesDone ?? 0), formatBytes(s.bytesTotal));
    }
    if (s.state === 'done' && s.startedAt && s.finishedAt)
      return formatDuration(Math.max(1000, s.finishedAt - s.startedAt));
    return null;
  };
  const icon = (s: (typeof r.steps)[number]) => {
    const failedHere = s.state === 'failed' || (r.status === 'failed' && s.state === 'running');
    if (failedHere) return <CircleX aria-hidden {...iconDefaults} className="size-5.5 shrink-0 text-danger" />;
    if (s.state === 'done')
      return <CircleCheck aria-hidden {...iconDefaults} className="size-5.5 shrink-0 text-success" />;
    if (s.state === 'running')
      return (
        <LoaderCircle
          aria-hidden
          {...iconDefaults}
          className="size-5.5 shrink-0 animate-spin text-warning motion-reduce:animate-none"
        />
      );
    return <Circle aria-hidden {...iconDefaults} className="size-5.5 shrink-0 text-ink-faint" />;
  };
  return (
    <ModalDialog
      open
      onOpenChange={(o) => (o ? null : onClose())}
      sheetOnPhone
      width="min(600px, 100%)"
      title={
        <span className="flex flex-col gap-1">
          <span className="text-body-sm font-normal text-ink-muted">{copy.step(3)}</span>
          <span>{title}</span>
          <span className="text-body-sm font-normal text-ink-muted">
            {r.status === 'failed'
              ? copy.backAsItWas(label, many)
              : r.status === 'succeeded'
                ? copy.doneLine(when, r.mode)
                : copy.fromLine(when, r.mode)}
          </span>
        </span>
      }
      actions={
        finished ? (
          <Button onClick={onClose}>{r.status === 'succeeded' ? copy.done : copy.close}</Button>
        ) : (
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            {r.cancellable ? (
              <Button
                variant="secondary"
                className="text-danger md:mr-auto"
                busy={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {copy.cancelRestore}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onClose} className="md:ml-auto">
              {copy.hide}
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4 text-ink">
        {r.status === 'failed' && r.error ? (
          <p
            role="alert"
            className="m-0 rounded-md bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3.5 py-3 text-body-sm"
          >
            {codeLine(r.error)}
          </p>
        ) : null}
        {r.status === 'running' ? <Progress value={pct} aria-label={title} className="min-w-0" /> : null}
        <ol className="m-0 list-none overflow-hidden rounded-lg bg-surface-input p-0" aria-label={title}>
          {r.steps.map((s, i) => (
            <li
              key={`${s.kind}:${s.appId ?? i}`}
              className="flex min-h-12 items-center gap-3.5 border-0 border-t border-solid border-hairline px-4 py-3 first:border-t-0"
            >
              {icon(s)}
              <span className="min-w-0 flex-1 text-body">{stepText(s)}</span>
              {stepRight(s) ? <span className="shrink-0 text-body-sm text-ink-muted">{stepRight(s)}</span> : null}
            </li>
          ))}
        </ol>
        <p className="m-0 text-body-sm text-ink-muted">
          {r.status === 'succeeded'
            ? r.mode === 'copy' && r.copyFolder
              ? copy.copiedTo(r.copyFolder)
              : r.wholeSystem
                ? copy.restartNote
                : copy.safetyGone
            : r.status === 'running'
              ? copy.safetyNote
              : null}
        </p>
      </div>
    </ModalDialog>
  );
}
