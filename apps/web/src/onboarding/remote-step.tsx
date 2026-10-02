// OnbRemote (US-ONB-18): the home network address is ready; Tailscale is optional. "Set up later" moves on to the
// starter apps without any Tailscale call; it can be turned on in Settings › Network & remote access. Connecting from
// here is US-ONB-17.
import { VISIBLE_PHASE, enabledOnboardingSteps } from '@hlabs/shared';
import { Globe, Wifi, iconDefaults } from '@hlabs/icons';
import { Button, List, ListRow, StatusDot } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { useTRPC, useTRPCClient } from '../lib/trpc';
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
  const steps = enabledOnboardingSteps(shippedPhase);
  const previous = steps[steps.indexOf('remote') - 1] ?? 'storage';
  const next = steps[steps.indexOf('remote') + 1] ?? 'apps';

  const later = useMutation({
    mutationFn: () => client.onboarding.setStep.mutate({ step: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
      await navigate({ to: '/setup/$step', params: { step: next } });
    },
  });

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
            subtitle={copy.tailscaleDetail}
          />
        </List>
      </div>
      {later.isError ? (
        <p role="alert" className="m-0 mt-4 text-body-sm">
          {copy.failed}
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-between gap-4">
        <Button variant="link" onClick={() => void navigate({ to: '/setup/$step', params: { step: previous } })}>
          {onboardingCopy.back}
        </Button>
        <Button variant="link" disabled={later.isPending} onClick={() => later.mutate()}>
          {copy.later}
        </Button>
      </div>
    </StepFrame>
  );
}
