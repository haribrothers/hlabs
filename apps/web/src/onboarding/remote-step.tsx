// OnbRemote (US-ONB-17, US-ONB-18): the home network address is ready; Tailscale is optional. Connect uses the same
// flow as Settings (log-in in a new tab, the tailnet confirmed first when Tailscale is already signed in, D-102…D-104)
// and asks every 2 s while it waits; once connected, Continue. "Set up later" moves on with no Tailscale call and
// stops any waiting.
import { VISIBLE_PHASE, enabledOnboardingSteps } from '@hlabs/shared';
import { Globe, Wifi, iconDefaults } from '@hlabs/icons';
import { Button, List, ListRow, StatusDot } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { LOGIN_POLL_MS, Problems, useRemoteConnect } from '../settings/remote-access';
import { StepFrame } from './step-frame';

const copy = onboardingCopy.remote;

function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-surface-control text-ink">{children}</span>
  );
}

export function RemoteStep({ shippedPhase = VISIBLE_PHASE }: { shippedPhase?: number }) {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const info = useQuery({ ...trpc.system.info.queryOptions(), retry: false });
  const { connect, problem, dialogs } = useRemoteConnect({ via: 'onboarding' });
  // Tailscale is only asked once Connect is pressed: "Set up later" makes no Tailscale call (US-ONB-18).
  const status = useQuery({
    ...trpc.network.status.queryOptions(),
    enabled: connect.isSuccess,
    retry: false,
    refetchInterval: (q) => (q.state.data?.remote.state === 'waiting' ? LOGIN_POLL_MS : false),
  });
  const steps = enabledOnboardingSteps(shippedPhase);
  const previous = steps[steps.indexOf('remote') - 1] ?? 'storage';
  const next = steps[steps.indexOf('remote') + 1] ?? 'apps';
  const remote = status.data?.remote;
  const connected = remote?.state === 'connected';

  const later = useMutation({
    mutationFn: () => client.onboarding.setStep.mutate({ step: next }),
    onSuccess: async () => {
      // Waiting stops here: nothing is configured unless the log-in had already finished.
      queryClient.removeQueries({ queryKey: trpc.network.status.queryKey() });
      await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
      await navigate({ to: '/setup/$step', params: { step: next } });
    },
  });

  let subtitle: ReactNode = copy.tailscaleDetail;
  let trailing: ReactNode = (
    <Button size="md" busy={connect.isPending} onClick={() => connect.mutate({})}>
      {copy.connect}
    </Button>
  );
  if (remote?.state === 'not_installed' || connect.data?.state === 'not_installed') subtitle = copy.installFirst;
  if (remote?.state === 'stopped' || connect.data?.state === 'stopped') subtitle = copy.notRunning;
  if (remote?.state === 'timed_out') subtitle = copy.timedOut;
  if (remote?.state === 'waiting') {
    subtitle = copy.tailscaleDetail;
    trailing = <StatusDot status="working">{copy.waiting}</StatusDot>;
  }
  if (connected) {
    subtitle = <span className="font-mono">{remote.url?.replace(/^https:\/\//, '')}</span>;
    trailing = <StatusDot status="running">{copy.connected}</StatusDot>;
  }

  return (
    <StepFrame step="remote" title={onboardingCopy.titles.remote} shippedPhase={shippedPhase}>
      <p className="m-0 mt-2 text-body text-ink-muted">{copy.lead}</p>
      <div className="mt-6">
        <List>
          <ListRow
            leading={
              <RowIcon>
                <Wifi aria-hidden {...iconDefaults} size={18} />
              </RowIcon>
            }
            title={<span className="font-semibold">{copy.homeNetwork}</span>}
            subtitle={info.data ? `https://${info.data.hostname}.local` : '…'}
            trailing={<StatusDot status="running">{copy.ready}</StatusDot>}
          />
          <ListRow
            leading={
              <RowIcon>
                <Globe aria-hidden {...iconDefaults} size={18} />
              </RowIcon>
            }
            title={<span className="font-semibold">{copy.tailscale}</span>}
            subtitle={subtitle}
            trailing={trailing}
            below={
              problem && problem !== 'conflict' ? (
                <Problems problem={problem} onRetry={() => connect.mutate({})} />
              ) : undefined
            }
          />
        </List>
      </div>
      {connected && remote.url ? (
        <div className="mt-4 rounded-md bg-surface-row px-4 py-3">
          <p className="m-0 text-body-sm text-ink-muted">{copy.appsOpenAt}</p>
          <p className="m-0 font-mono text-mono text-ink">{`${remote.url.replace(/:\d+$/, '')}:12001`}</p>
        </div>
      ) : null}
      {later.isError ? (
        <p role="alert" className="m-0 mt-4 text-body-sm">
          {copy.failed}
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-between gap-4">
        <Button variant="link" onClick={() => void navigate({ to: '/setup/$step', params: { step: previous } })}>
          {onboardingCopy.back}
        </Button>
        <Button variant={connected ? 'secondary' : 'link'} disabled={later.isPending} onClick={() => later.mutate()}>
          {connected ? copy.continue : copy.later}
        </Button>
      </div>
      {dialogs}
    </StepFrame>
  );
}
