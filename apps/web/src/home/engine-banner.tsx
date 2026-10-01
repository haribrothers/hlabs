// "The container engine has stopped" (US-STATE-08): over Home, above the Dock as SysEngineStopped draws it, while the
// engine is down. Details opens Settings › Engine & startup. Short blips don't flash it: it waits a moment first.
import { iconDefaults, TriangleAlert } from '@hlabs/icons';
import { EXCLUSIVE_JOB_KINDS } from '@hlabs/shared';
import { Button } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { engineCopy } from '../copy/engine';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useActiveJobs } from '../settings/engine-restart';

/** How long the engine has to stay down before the banner shows (inside the 2 s the story allows). */
export const BANNER_DELAY_MS = 1_500;

export function EngineBanner({ down, actions }: { down: boolean; actions?: ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!down) return;
    const timer = setTimeout(() => setShown(true), BANNER_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [down]);
  if (!down || !shown) return null;
  return (
    <div
      role="status"
      className="hl-glass hl-glass-2 fixed inset-x-4 bottom-32 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-4 rounded-lg border border-danger/50 bg-[color-mix(in_srgb,var(--danger-fill)_35%,var(--surface-dialog))] px-5 py-4 md:bottom-28"
    >
      <TriangleAlert aria-hidden {...iconDefaults} className="size-6 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="m-0 text-body font-bold text-ink">{engineCopy.stoppedTitle}</p>
        <p className="m-0 text-body-sm text-ink-muted">{engineCopy.stoppedBody}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <Link
          to="/settings/$section"
          params={{ section: 'engine' }}
          className="hl-btn hl-btn-secondary hl-btn-md hl-focus no-underline"
        >
          {engineCopy.details}
        </Link>
        {actions}
      </div>
    </div>
  );
}

const EXCLUSIVE = new Set<string>(EXCLUSIVE_JOB_KINDS);

/**
 * Start engine (US-STATE-09), for admins: "Starting…" until the engine_start job ends; a second press can't start a
 * second job. Waits while a task that runs alone is going (D-020).
 */
export function StartEngineButton() {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const jobs = useActiveJobs();
  const exclusive = jobs.data?.items.find((j) => EXCLUSIVE.has(j.kind));
  const starting = jobs.data?.items.some((j) => j.kind === 'engine_start');
  const start = useMutation({
    mutationFn: () => client.settings.engine.start.mutate(),
    meta: { inlineErrors: true },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() }),
    onError: (err) => {
      if (!handledGlobally(err)) showErrorToast(err);
    },
  });
  const busy = start.isPending || Boolean(starting);
  const wait = exclusive ? engineCopy.waitForTask : undefined;
  return (
    <span title={wait}>
      <Button busy={busy} disabled={busy || Boolean(exclusive)} aria-description={wait} onClick={() => start.mutate()}>
        {busy ? engineCopy.startingEngine : engineCopy.start}
      </Button>
    </span>
  );
}
