// OnbSystem (US-ONB-04): check this computer, then Continue to the account step or go Back to welcome.
import { Button, List, ListRow, Progress, StatusDot } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TRPCClientError } from '@trpc/client';
import { useEffect, useRef } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { useTRPC } from '../lib/trpc';
import { isInstalling, shouldInstallEngine, systemRows } from './system-rows';

const copy = onboardingCopy.system;

function continueError(err: unknown): string {
  const code = err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;
  return code === 'ENGINE_UNAVAILABLE' || code === 'DISK_FULL' ? copy.continueFailed[code] : copy.continueFailed.other;
}

export function SystemStep() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const check = useQuery({
    ...trpc.onboarding.checkSystem.queryOptions(),
    staleTime: 0,
    // Re-check every 2 s while the engine install runs (US-ONB-05).
    refetchInterval: (query) => (isInstalling(query.state.data) ? 2_000 : false),
  });
  const install = useMutation(trpc.onboarding.installEngine.mutationOptions({ onSettled: () => check.refetch() }));
  const installRequested = useRef(false);
  useEffect(() => {
    if (installRequested.current || !shouldInstallEngine(check.data)) return;
    installRequested.current = true;
    install.mutate();
  }, [check.data, install]);
  const confirm = useMutation(
    trpc.onboarding.confirmSystem.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
        await navigate({ to: '/setup/$step', params: { step: 'account' } });
      },
    }),
  );
  const rows = systemRows(check.data);
  const canContinue = check.data?.canContinue === true && !check.isFetching;

  return (
    <>
      <p className="m-0 mt-2 text-body text-ink-muted">{copy.lead}</p>
      <div className="mt-6" aria-busy={check.isFetching}>
        <List>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              title={row.title}
              subtitle={row.hint}
              trailing={<StatusDot status={row.status}>{row.value}</StatusDot>}
              below={
                row.progress !== undefined ? (
                  <>
                    <Progress value={row.progress} aria-label={row.value} />
                    <span>{row.note}</span>
                  </>
                ) : undefined
              }
            />
          ))}
        </List>
      </div>
      {check.isError ? (
        <p role="alert" className="m-0 mt-4 text-body-sm">
          {copy.checkFailed}
        </p>
      ) : null}
      {confirm.isError ? (
        <p role="alert" className="m-0 mt-4 text-body-sm">
          {continueError(confirm.error)}
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-between gap-4">
        <Button variant="link" onClick={() => void navigate({ to: '/setup' })}>
          {onboardingCopy.back}
        </Button>
        <div className="flex items-center gap-3">
          {check.data && !check.data.canContinue ? (
            <Button variant="secondary" onClick={() => void check.refetch()} disabled={check.isFetching}>
              {copy.checkAgain}
            </Button>
          ) : null}
          {/* Start at login (Switch) is chosen here from US-ONB-07; until then the default (on) is kept. */}
          <Button
            size="lg"
            onClick={() => confirm.mutate({ startAtLogin: true })}
            disabled={!canContinue || confirm.isPending}
            aria-busy={confirm.isPending}
          >
            {onboardingCopy.continue}
          </Button>
        </div>
      </div>
    </>
  );
}
