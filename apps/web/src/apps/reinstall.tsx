// Reinstalling an app (US-APP-24, D-125): "Reinstall…" opens "Reinstall <App>?", which says what's downloaded again
// and what's kept; while it runs, the step and how far it has got. "Reinstall…" waits when it can't run (no engine,
// another job, apps paused) and the dialog says so when the app's saved settings are gone. Admins only.
import type { AppDetail } from '@hlabs/api';
import { EXCLUSIVE_JOB_KINDS, formatBytes } from '@hlabs/shared';
import { Check, iconDefaults, Wrench } from '@hlabs/icons';
import { Button, ModalDialog, Progress } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, type ComponentProps } from 'react';
import { appsCopy } from '../copy/apps';
import { jobNames } from '../copy/errors';
import { errorLine } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useActiveJobs } from '../settings/engine-restart';

const copy = appsCopy;
const EXCLUSIVE = new Set<string>(EXCLUSIVE_JOB_KINDS);
/** States a reinstall can start from (02 §2.5). */
const FROM = new Set<AppDetail['state']>(['running', 'stopped', 'error']);

export type ReinstallStep = keyof typeof copy.reinstallStep;

/** The app's reinstall while one runs: its step and how far it has got. */
export function useReinstallJob(app: AppDetail) {
  const jobs = useActiveJobs(app.state === 'reinstalling');
  const job = jobs.data?.items.find((j) => j.kind === 'app_reinstall' && j.target === app.id) ?? null;
  let step: ReinstallStep = 'stopping';
  try {
    step = (JSON.parse(job?.message ?? '{}') as { step?: ReinstallStep }).step ?? 'stopping';
  } catch {
    // An older message: the first step will do.
  }
  return { progress: job?.progress ?? 0, step };
}

/** Why "Reinstall…" can't be pressed now, or null (US-APP-24). */
export function useReinstallWait(app: AppDetail): string | null {
  // The jobs going now, read once (and on focus): no live feed for a button (the app's own state is live already).
  const trpc = useTRPC();
  const jobs = useQuery({ ...trpc.jobs.list.queryOptions(), retry: false });
  if (!app.engineRunning) return copy.engineFirst;
  if (app.reinstall?.blocked === 'paused') return copy.resumeFirst;
  const busy = jobs.data?.items.find(
    (j) => EXCLUSIVE.has(j.kind) || (j.target === app.id && j.kind !== 'app_reinstall'),
  );
  if (busy) return copy.waitFor(jobNames[busy.kind] ?? 'what hlabs is doing');
  if (!FROM.has(app.state)) return copy.waitFor(copy.status[app.state].replace(/…$/, '').toLowerCase());
  return null;
}

/** "Reinstall…": opens the dialog, or says why it waits. */
export function ReinstallButton({
  app,
  onOpen,
  icon = true,
  variant = 'secondary',
  size,
}: {
  app: AppDetail;
  onOpen: () => void;
  icon?: boolean;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
}) {
  const wait = useReinstallWait(app);
  if (!app.reinstall) return null;
  return (
    <Button variant={variant} size={size} disabled={wait !== null} title={wait ?? undefined} onClick={onOpen}>
      {icon ? <Wrench aria-hidden {...iconDefaults} className="size-4" /> : null}
      {copy.reinstallEllipsis}
    </Button>
  );
}

/** "Reinstall <App>?" (ReinstallConfirm): what's downloaded again and what's kept; Cancel has focus first. */
export function ReinstallDialog({
  app,
  open,
  onOpenChange,
}: {
  app: AppDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const cancel = useRef<HTMLButtonElement>(null);
  const reinstall = useMutation({
    mutationFn: () => client.apps.reinstall.mutate({ appId: app.id }),
    meta: { inlineErrors: true },
    onSuccess: () => {
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId: app.id }) });
      void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() });
    },
  });
  const info = app.reinstall;
  if (!info) return null;
  const missing = info.blocked === 'settings_missing' || info.blocked === 'manifest_missing';
  const size = info.downloadBytes ? formatBytes(info.downloadBytes) : null;
  const close = (next: boolean) => {
    if (!next) reinstall.reset();
    onOpenChange(next);
  };
  return (
    <ModalDialog
      open={open}
      onOpenChange={close}
      dismissible={!reinstall.isPending}
      title={copy.reinstallTitle(app.name)}
      description={missing ? copy.reinstallBlocked(app.name) : copy.reinstallBody(app.name, info.version, size)}
      initialFocus={cancel}
      sheetOnPhone
      actions={
        <>
          <Button ref={cancel} variant="secondary" disabled={reinstall.isPending} onClick={() => close(false)}>
            {copy.cancel}
          </Button>
          {missing ? null : (
            <Button busy={reinstall.isPending} disabled={reinstall.isPending} onClick={() => reinstall.mutate()}>
              {copy.reinstall}
            </Button>
          )}
        </>
      }
    >
      {missing ? null : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-md bg-surface-row p-4">
            <p className="m-0 text-label font-bold text-ink">{copy.keptTitle}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {copy.kept.map((line) => (
                <li key={line} className="flex items-center gap-2.5 text-body text-ink">
                  <Check aria-hidden {...iconDefaults} className="size-4 shrink-0 text-success" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          {app.state === 'stopped' ? <p className="m-0 text-body-sm text-ink-muted">{copy.startsWhenDone}</p> : null}
          {reinstall.error ? (
            <p role="alert" className="m-0 text-body-sm text-danger">
              {errorLine(reinstall.error)}
            </p>
          ) : null}
        </div>
      )}
    </ModalDialog>
  );
}

/** The step and how far a reinstall has got: "Downloading Uptime Kuma 1.23.16 · 42%". */
export function ReinstallProgress({ app }: { app: AppDetail }) {
  const { progress, step } = useReinstallJob(app);
  const label =
    step === 'pulling'
      ? copy.reinstallStep.pulling(app.name, app.reinstall?.version ?? app.version)
      : copy.reinstallStep[step];
  return <Progress value={progress} label={label} aria-label={copy.reinstalling(app.name)} />;
}
