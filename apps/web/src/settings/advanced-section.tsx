// Settings › Advanced (SettingsAdvanced): hlabs's own logs (US-SYS-27), the diagnostics bundle (US-SYS-28), what hlabs
// connects to (US-SYS-29), Beta updates (US-SYS-30), Restart hlabs (US-SYS-31) and the factory reset (US-SYS-37, 38).
// "Terminal" and "API tokens" aren't built (13 Open questions), and AI access waits for its phase (D-036).
import { EXCLUSIVE_JOB_KINDS, isFeatureEnabled } from '@hlabs/shared';
import { FileDown, FlaskConical, Globe, RotateCcw, ScrollText, Sparkles, TriangleAlert } from '@hlabs/icons';
import { Button, List, ListRow, Switch } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { advancedCopy as copy } from '../copy/advanced';
import { jobNames } from '../copy/errors';
import { markRestarting } from '../health/restarting';
import { browser } from '../lib/browser';
import { confirm } from '../lib/confirm';
import { handledGlobally } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { useIsDesktop } from '../lib/use-media';
import { ConnectionsDialog } from './connections-dialog';
import { FactoryResetDialog } from './factory-reset-dialog';
import { HlabsLogs } from './hlabs-logs';
import { RowEnd, RowIcon } from './phone-rows';

/** How often a diagnostics job is asked about while it's built. */
const JOB_POLL_MS = 1_000;
const EXCLUSIVE: ReadonlySet<string> = new Set(EXCLUSIVE_JOB_KINDS);

/** The file name the daemon gives (`hlabs-diagnostics-<hostname>-<date>.zip`), or a plain one. */
function fileName(res: Response): string {
  return /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'hlabs-diagnostics.zip';
}

function Troubleshooting() {
  const client = useTRPCClient();
  // A phone (PhoneRedesignA_Advanced): icon squares, and the rows that open something are buttons with a chevron.
  const phone = !useIsDesktop();
  const [open, setOpen] = useState<'logs' | 'connections' | null>(null);
  const diagnostics = useMutation({
    mutationFn: async () => {
      const { jobId } = await client.system.diagnostics.mutate();
      for (;;) {
        const job = await client.jobs.get.query({ jobId });
        if (job.state === 'failed' || job.state === 'cancelled') throw new Error(job.state);
        if (job.state === 'succeeded') break;
        await new Promise((r) => setTimeout(r, JOB_POLL_MS));
      }
      const res = await fetch(`/api/diagnostics/${encodeURIComponent(jobId)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`download answered ${res.status}`);
      browser.save(await res.blob(), fileName(res));
    },
    onSuccess: () => showToast({ tone: 'success', title: copy.diagnosticsReady, body: copy.diagnosticsReadyBody }),
    onError: (err) => {
      if (!handledGlobally(err)) showToast({ tone: 'danger', title: copy.diagnosticsFailed });
    },
  });
  return (
    <List label={copy.troubleshooting}>
      {phone ? (
        <ListRow
          leading={<RowIcon icon={ScrollText} />}
          title={copy.logs}
          subtitle={copy.logsNote}
          trailing={<RowEnd chevron />}
          label={`${copy.view} ${copy.logs}`}
          onPress={() => setOpen('logs')}
        />
      ) : (
        <ListRow
          title={copy.logs}
          subtitle={copy.logsNote}
          trailing={
            <Button variant="secondary" size="sm" onClick={() => setOpen('logs')}>
              {copy.view}
            </Button>
          }
        />
      )}
      <ListRow
        leading={phone ? <RowIcon icon={FileDown} /> : undefined}
        title={copy.diagnostics}
        subtitle={copy.diagnosticsNote}
        trailing={
          <Button variant="secondary" size="sm" busy={diagnostics.isPending} onClick={() => diagnostics.mutate()}>
            {diagnostics.isPending ? copy.preparing : copy.download}
          </Button>
        }
      />
      {phone ? (
        <ListRow
          leading={<RowIcon icon={Globe} />}
          title={copy.connections}
          subtitle={copy.connectionsNote}
          trailing={<RowEnd chevron />}
          label={`${copy.view} ${copy.connections}`}
          onPress={() => setOpen('connections')}
        />
      ) : (
        <ListRow
          title={copy.connections}
          subtitle={copy.connectionsNote}
          trailing={
            <Button
              variant="secondary"
              size="sm"
              aria-label={`${copy.view} ${copy.connections}`}
              onClick={() => setOpen('connections')}
            >
              {copy.view}
            </Button>
          }
        />
      )}
      {open === 'logs' ? <HlabsLogs onClose={() => setOpen(null)} /> : null}
      {open === 'connections' ? <ConnectionsDialog onClose={() => setOpen(null)} /> : null}
    </List>
  );
}

/** Beta updates (US-SYS-30): the update channel; turning it on checks for a beta at once (the daemon does). */
function Developer({ shippedPhase }: { shippedPhase?: number }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const key = trpc.settings.updates.get.queryKey();
  const status = useQuery({ ...trpc.settings.updates.get.queryOptions(), retry: false });
  const save = useMutation({
    mutationFn: (beta: boolean) => client.settings.updates.setChannel.mutate({ channel: beta ? 'beta' : 'stable' }),
    onMutate: async (beta) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old) =>
        old ? { ...old, channel: beta ? ('beta' as const) : ('stable' as const) } : old,
      );
      return { before };
    },
    onSuccess: (_ok, beta) => showToast({ tone: 'neutral', title: beta ? copy.betaOn : copy.betaOff }),
    onError: (err, _beta, context) => {
      queryClient.setQueryData(key, context?.before);
      if (!handledGlobally(err)) showToast({ tone: 'danger', title: copy.saveFailed });
    },
    // The check it started may find a version soon after.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: key }), 3_000);
    },
  });
  const beta = status.data?.channel === 'beta';
  const phone = !useIsDesktop();
  return (
    <List label={copy.developer}>
      {isFeatureEnabled('aiAccess', shippedPhase) ? (
        <ListRow
          leading={phone ? <RowIcon icon={Sparkles} /> : undefined}
          title={copy.ai}
          subtitle={copy.aiNote}
          trailing={
            <Button variant="secondary" size="sm">
              {copy.setUp}
            </Button>
          }
        />
      ) : null}
      <ListRow
        leading={phone ? <RowIcon icon={FlaskConical} /> : undefined}
        title={copy.beta}
        subtitle={copy.betaNote}
        trailing={
          <Switch checked={beta} disabled={!status.data} aria-label={copy.beta} onChange={(on) => save.mutate(on)} />
        }
      />
    </List>
  );
}

function DangerZone({ withReset, shippedPhase }: { withReset: boolean; shippedPhase?: number }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const info = useQuery({ ...trpc.system.info.queryOptions(), retry: false });
  const active = useQuery({ ...trpc.jobs.list.queryOptions(), retry: false });
  // A job starting or ending can block or free Restart.
  useEventStream((event) => {
    if (event.type === 'job.finished' || (event.type === 'job.progress' && event.data.progress === 0)) {
      void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() });
    }
  });
  const exclusive = active.data?.items.find((j) => EXCLUSIVE.has(j.kind)) ?? null;
  const phone = !useIsDesktop();

  const restart = async () => {
    await confirm({
      title: copy.restartTitle,
      body: copy.restartBody,
      confirmLabel: copy.restartButton,
      onConfirm: async () => {
        await client.system.restartDaemon.mutate();
        // The whole page gives way to "Restarting hlabs…" until hlabs answers again.
        markRestarting();
      },
    });
  };

  return (
    <List label={copy.dangerZone} tone="danger">
      <ListRow
        leading={phone ? <RowIcon icon={RotateCcw} /> : undefined}
        title={copy.restart}
        subtitle={exclusive ? copy.restartBlocked(jobNames[exclusive.kind] ?? exclusive.kind) : copy.restartNote}
        trailing={
          <Button
            variant="secondary"
            size="sm"
            disabled={!active.data || exclusive !== null}
            onClick={() => void restart()}
          >
            {copy.restartButton}
          </Button>
        }
      />
      {withReset ? (
        <ListRow
          leading={phone ? <RowIcon icon={TriangleAlert} /> : undefined}
          title={copy.reset}
          subtitle={copy.resetNote}
          trailing={
            <Button variant="destructive" size="sm" disabled={!info.data} onClick={() => setResetting(true)}>
              {copy.resetButton}
            </Button>
          }
        />
      ) : null}
      {resetting && info.data ? (
        <FactoryResetDialog
          hostname={info.data.hostname}
          shippedPhase={shippedPhase}
          onClose={() => setResetting(false)}
        />
      ) : null}
    </List>
  );
}

export function AdvancedSection({ shippedPhase }: { shippedPhase?: number }) {
  return (
    <div className="flex flex-col gap-6">
      <Troubleshooting />
      <Developer shippedPhase={shippedPhase} />
      <DangerZone withReset={isFeatureEnabled('factoryReset', shippedPhase)} shippedPhase={shippedPhase} />
    </div>
  );
}
