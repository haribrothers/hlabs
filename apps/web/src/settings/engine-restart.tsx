// Restart engine (US-SYS-18): confirm, then a job whose progress shows in the engine row. Not while an exclusive job
// runs (D-020); a stopped engine offers Start engine instead.
import { EXCLUSIVE_JOB_KINDS } from '@hlabs/shared';
import { Button, Progress } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { engineCopy } from '../copy/engine';
import { confirm } from '../lib/confirm';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

const copy = engineCopy;
const EXCLUSIVE = new Set<string>(EXCLUSIVE_JOB_KINDS);

/** Active jobs, kept current by job events. An engine restart that fails says so (the engine is then stopped). */
export function useActiveJobs() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['job.progress', 'job.finished'] },
      {
        onData: ({ data: event }) => {
          void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() });
          if (event.type === 'job.finished' && event.data.kind === 'engine_restart' && event.data.state === 'failed') {
            showToast({ tone: 'danger', title: copy.notBack });
          }
        },
      },
    ),
  );
  return useQuery({ ...trpc.jobs.list.queryOptions(), retry: false });
}

/** The trailing control of the active engine's row. */
export function EngineRestartControl({ stopped }: { stopped: boolean }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const jobs = useActiveJobs();
  const exclusive = jobs.data?.items.find((j) => EXCLUSIVE.has(j.kind));
  const restarting = jobs.data?.items.find((j) => j.kind === 'engine_restart');

  const restart = useMutation({
    mutationFn: () => (stopped ? client.settings.engine.start.mutate() : client.settings.engine.restart.mutate()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trpc.jobs.list.queryKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.settings.engine.get.queryKey() });
    },
    onError: () => {
      showToast({ tone: 'danger', title: copy.restartFailed });
    },
  });

  if (restarting) {
    return (
      <div className="w-48">
        <Progress value={restarting.progress} aria-label={copy.restarting} />
      </div>
    );
  }
  const waitFor = exclusive ? copy.waitFor(copy.jobs[exclusive.kind] ?? exclusive.kind) : undefined;
  return (
    <span title={waitFor}>
      <Button
        variant="secondary"
        size="sm"
        disabled={Boolean(exclusive)}
        aria-description={waitFor}
        busy={restart.isPending}
        onClick={() =>
          stopped
            ? restart.mutate()
            : void confirm({
                title: copy.restartTitle,
                body: copy.restartBody,
                confirmLabel: copy.restartConfirm,
                onConfirm: () => restart.mutateAsync(),
              })
        }
      >
        {stopped ? copy.start : copy.restart}
      </Button>
    </span>
  );
}
