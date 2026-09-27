// OnbStorage (US-ONB-14): where Home folders, shared files and media live. In phase 1 this is the last step, so
// Continue also completes onboarding and opens the finish screen (D-041).
import { HardDrive, Info, Monitor, Server, iconDefaults } from '@hlabs/icons';
import { formatBytes } from '@hlabs/shared';
import { Badge, Button, ChoiceList } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TRPCClientError } from '@trpc/client';
import { useState } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { clearSetupToken } from '../lib/setup-token';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { StepFrame } from './step-frame';

const copy = onboardingCopy.storage;

type Location = 'local' | 'external' | 'nas';

/** "/Users/hari/hlabs" → "~/hlabs". */
export const tildePath = (path: string) => path.replace(/^\/(Users|home)\/[^/]+/, '~');

const hlabsCode = (err: unknown) =>
  err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;

export function StorageStep() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<Location>('local');
  const check = useQuery({ ...trpc.onboarding.checkSystem.queryOptions(), retry: false });
  const disk = check.data?.disk;
  const path = disk ? tildePath(disk.path) : '';

  const save = useMutation({
    mutationFn: async () => {
      await client.onboarding.setStorage.mutate({ kind: 'local' });
      const status = await client.onboarding.status.query();
      if (status.step === 'done') {
        await client.onboarding.complete.mutate();
        clearSetupToken();
      }
      return status.step;
    },
    onSuccess: async (step) => {
      await queryClient.invalidateQueries({ queryKey: trpc.onboarding.status.queryKey() });
      await navigate({ to: '/setup/$step', params: { step } });
    },
  });
  const notWritable = hlabsCode(save.error) === 'STORAGE_NOT_WRITABLE';

  return (
    <StepFrame step="storage" title={onboardingCopy.titles.storage}>
      <p className="m-0 mt-2 text-body text-ink-muted">{copy.lead}</p>
      <ChoiceList<Location>
        className="mt-6"
        label={copy.listLabel}
        value={choice}
        onChange={setChoice}
        options={[
          {
            value: 'local',
            icon: <Monitor {...iconDefaults} />,
            title: copy.local,
            subtitle: notWritable ? (
              <span className="text-danger">{copy.notWritable(path)}</span>
            ) : disk ? (
              copy.localDetail(path, formatBytes(disk.freeBytes))
            ) : undefined,
            trailing: <Badge>{copy.fastest}</Badge>,
          },
          // Choosing a drive or a NAS arrives with US-ONB-15 and US-ONB-16.
          {
            value: 'external',
            icon: <HardDrive {...iconDefaults} />,
            title: copy.external,
            subtitle: copy.externalDetail,
          },
          { value: 'nas', icon: <Server {...iconDefaults} />, title: copy.nas, subtitle: copy.nasDetail },
        ]}
      />
      <p className="m-0 mt-6 flex items-start gap-2 rounded-sm bg-surface-row p-3 text-body-sm text-ink-muted">
        <Info aria-hidden {...iconDefaults} className="shrink-0" />
        {copy.note}
      </p>
      {save.isError && !notWritable ? (
        <p role="alert" className="m-0 mt-4 text-body-sm">
          {copy.failed}
        </p>
      ) : null}
      {notWritable ? (
        <p role="alert" className="sr-only">
          {copy.notWritable(path)}
        </p>
      ) : null}
      <div className="mt-8 flex items-center justify-between gap-4">
        <Button variant="link" onClick={() => void navigate({ to: '/setup/$step', params: { step: 'twoFactor' } })}>
          {onboardingCopy.back}
        </Button>
        <Button
          size="lg"
          onClick={() => save.mutate()}
          disabled={choice !== 'local' || save.isPending}
          aria-busy={save.isPending}
        >
          {onboardingCopy.continue}
        </Button>
      </div>
    </StepFrame>
  );
}
