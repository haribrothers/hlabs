// OnbStorage (US-ONB-14, US-ONB-15): where Home folders, shared files and media live. In phase 1 this is the last
// step, so Continue also completes onboarding and opens the finish screen (D-041).
import { HardDrive, Info, Monitor, Server, TriangleAlert, iconDefaults } from '@hlabs/icons';
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

/** FAT32 and exFAT can't keep file permissions (US-ONB-15). */
export const lacksPermissions = (fsType: string) => fsType === 'fat32' || fsType === 'exfat';

/** Drives are re-listed this often while "External drive" is chosen. */
export const DRIVES_REFRESH_MS = 3_000;

const hlabsCode = (err: unknown) =>
  err instanceof TRPCClientError ? (err.data as { hlabsCode?: string } | undefined)?.hlabsCode : undefined;

export function StorageStep() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<Location>('local');
  const [drivePath, setDrivePath] = useState('');
  const [driveGone, setDriveGone] = useState(false);

  const check = useQuery({ ...trpc.onboarding.checkSystem.queryOptions(), retry: false });
  const disk = check.data?.disk;
  const path = disk ? tildePath(disk.path) : '';

  const drivesQuery = useQuery({
    ...trpc.storage.listDrives.queryOptions(),
    enabled: choice === 'external',
    refetchInterval: DRIVES_REFRESH_MS,
    retry: false,
  });
  const drives = drivesQuery.data?.drives;
  // A chosen drive that disappears (ejected) is unselected, and the list says so (US-ONB-15).
  const [seenDrives, setSeenDrives] = useState(drives);
  if (drives !== seenDrives) {
    setSeenDrives(drives);
    if (drivePath && drives && !drives.some((d) => d.path === drivePath)) {
      setDrivePath('');
      setDriveGone(true);
    }
  }
  const chosenDrive = drives?.find((d) => d.path === drivePath);

  const save = useMutation({
    mutationFn: async () => {
      await client.onboarding.setStorage.mutate(
        choice === 'external' ? { kind: 'external', path: drivePath } : { kind: 'local' },
      );
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
    onError: (err) => {
      if (choice === 'external' && hlabsCode(err) === 'NOT_FOUND') {
        setDrivePath('');
        setDriveGone(true);
      }
    },
  });
  const notWritable = choice === 'local' && hlabsCode(save.error) === 'STORAGE_NOT_WRITABLE';
  const canContinue = choice === 'local' || (choice === 'external' && drivePath !== '');

  return (
    <StepFrame step="storage" title={onboardingCopy.titles.storage}>
      <p className="m-0 mt-2 text-body text-ink-muted">{copy.lead}</p>
      <ChoiceList<Location>
        className="mt-6"
        label={copy.listLabel}
        value={choice}
        onChange={(next) => {
          setChoice(next);
          save.reset();
        }}
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
          {
            value: 'external',
            icon: <HardDrive {...iconDefaults} />,
            title: copy.external,
            subtitle: copy.externalDetail,
          },
          // Network storage arrives with US-ONB-16.
          { value: 'nas', icon: <Server {...iconDefaults} />, title: copy.nas, subtitle: copy.nasDetail },
        ]}
      />
      {choice === 'external' ? (
        <div className="mt-4 flex flex-col gap-3">
          {driveGone ? (
            <p role="alert" className="m-0 text-body-sm text-danger">
              {copy.driveGone}
            </p>
          ) : null}
          {drives && drives.length === 0 ? (
            <p className="m-0 text-body-sm text-ink-muted" role="status">
              {copy.noDrives}
            </p>
          ) : null}
          {drives && drives.length > 0 ? (
            <ChoiceList
              label={copy.drivesLabel}
              value={drivePath}
              onChange={(next) => {
                setDrivePath(next);
                setDriveGone(false);
              }}
              options={drives.map((d) => ({
                value: d.path,
                title: d.name,
                subtitle: copy.driveDetail(formatBytes(d.freeBytes), copy.fsNames[d.fsType]),
              }))}
            />
          ) : null}
          {chosenDrive && lacksPermissions(chosenDrive.fsType) ? (
            <p className="m-0 flex items-start gap-2 text-body-sm text-warning">
              <TriangleAlert aria-hidden {...iconDefaults} className="shrink-0" />
              {copy.noPermissions}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="m-0 mt-6 flex items-start gap-2 rounded-sm bg-surface-row p-3 text-body-sm text-ink-muted">
        <Info aria-hidden {...iconDefaults} className="shrink-0" />
        {copy.note}
      </p>
      {save.isError && !notWritable && !driveGone ? (
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
          disabled={!canContinue || save.isPending}
          aria-busy={save.isPending}
        >
          {onboardingCopy.continue}
        </Button>
      </div>
    </StepFrame>
  );
}
