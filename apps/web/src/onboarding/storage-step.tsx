// OnbStorage (US-ONB-14, US-ONB-15, US-ONB-16): where Home folders, shared files and media live. In phase 1 this is the last
// step, so Continue also completes onboarding and opens the finish screen (D-041).
import { HardDrive, Info, Monitor, Server, TriangleAlert, iconDefaults } from '@hlabs/icons';
import { formatBytes } from '@hlabs/shared';
import { Badge, Button, ChoiceList, Segmented, TextField } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { TRPCClientError } from '@trpc/client';
import { useState } from 'react';
import { onboardingCopy } from '../copy/onboarding';
import { clearSetupToken } from '../lib/setup-token';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { nasFieldError, parseNasAddress, type NasField, type NasProtocol } from './nas-form';
import { StepFrame } from './step-frame';

const copy = onboardingCopy.storage;

type Location = 'local' | 'external' | 'nas';

/** "/Users/hari/hlabs" → "~/hlabs". */
export const tildePath = (path: string) => path.replace(/^\/(Users|home)\/[^/]+/, '~');

/** FAT32 and exFAT can't keep file permissions (US-ONB-15). */
export const lacksPermissions = (fsType: string) => fsType === 'fat32' || fsType === 'exfat';

/** Drives are re-listed this often while "External drive" is chosen. */
export const DRIVES_REFRESH_MS = 3_000;

const errorData = (err: unknown) =>
  err instanceof TRPCClientError
    ? (err.data as { hlabsCode?: string; detail?: { reason?: string; missing?: string } | null } | undefined)
    : undefined;
const hlabsCode = (err: unknown) => errorData(err)?.hlabsCode;

export function StorageStep() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<Location>('local');
  const [drivePath, setDrivePath] = useState('');
  const [driveGone, setDriveGone] = useState(false);
  const [nas, setNas] = useState({ protocol: 'smb' as NasProtocol, address: '', username: '', password: '' });
  const [nasError, setNasError] = useState<{ field: NasField; message: string } | null>(null);
  const nasChange = (patch: Partial<typeof nas>) => {
    setNas((n) => ({ ...n, ...patch }));
    setNasError(null);
  };

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
      if (choice === 'nas') {
        // Test the connection first, then mount it for good and make it the root (US-ONB-16).
        const where = parseNasAddress(nas.protocol, nas.address)!;
        const share = {
          protocol: nas.protocol,
          ...where,
          ...(nas.protocol === 'smb' && nas.username ? { username: nas.username, password: nas.password } : {}),
        };
        try {
          await client.storage.locations.testNetwork.mutate(share);
          const { locationId } = await client.storage.locations.addNetwork.mutate(share);
          await client.onboarding.setStorage.mutate({ kind: 'nas', locationId });
        } catch (err) {
          setNasError(nasFieldError(hlabsCode(err), errorData(err)?.detail?.reason ?? undefined, where));
          throw err;
        }
      } else {
        await client.onboarding.setStorage.mutate(
          choice === 'external' ? { kind: 'external', path: drivePath } : { kind: 'local' },
        );
      }
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
      // A required step is missing after all: go back to it (US-ONB-22).
      const missing = errorData(err)?.detail?.missing;
      if (hlabsCode(err) === 'ONBOARDING_INCOMPLETE' && (missing === 'account' || missing === 'storage')) {
        void navigate({ to: '/setup/$step', params: { step: missing } });
        return;
      }
      if (choice === 'external' && hlabsCode(err) === 'NOT_FOUND') {
        setDrivePath('');
        setDriveGone(true);
      }
    },
  });
  const notWritable = choice === 'local' && hlabsCode(save.error) === 'STORAGE_NOT_WRITABLE';
  const canContinue =
    choice === 'local' ||
    (choice === 'external' && drivePath !== '') ||
    (choice === 'nas' && nas.address.trim() !== '');
  const submit = () => {
    if (choice === 'nas' && !parseNasAddress(nas.protocol, nas.address)) {
      setNasError({ field: 'address', message: copy.nasForm.badAddress });
      return;
    }
    setNasError(null);
    save.mutate();
  };
  const nasFieldMessage = (field: NasField) => (nasError?.field === field ? nasError.message : undefined);

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
      {choice === 'nas' ? (
        <div className="mt-4 flex flex-col gap-4">
          <Segmented
            aria-label={copy.nasForm.protocol}
            options={[
              { value: 'smb', label: 'SMB' },
              { value: 'nfs', label: 'NFS' },
            ]}
            value={nas.protocol}
            onChange={(v) => nasChange({ protocol: v as NasProtocol })}
          />
          <TextField
            label={copy.nasForm.address}
            hint={copy.nasForm.addressHint}
            error={nasFieldMessage('address')}
            autoCapitalize="none"
            spellCheck={false}
            value={nas.address}
            onChange={(e) => nasChange({ address: e.target.value })}
          />
          {nas.protocol === 'smb' ? (
            <>
              <TextField
                label={copy.nasForm.username}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                error={nasFieldMessage('username')}
                value={nas.username}
                onChange={(e) => nasChange({ username: e.target.value })}
              />
              <TextField
                label={copy.nasForm.password}
                type="password"
                autoComplete="off"
                error={nasFieldMessage('password')}
                value={nas.password}
                onChange={(e) => nasChange({ password: e.target.value })}
              />
            </>
          ) : null}
          {nasError?.field === 'form' ? (
            <p role="alert" className="m-0 text-body-sm text-danger">
              {nasError.message}
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="m-0 mt-6 flex items-start gap-2 rounded-sm bg-surface-row p-3 text-body-sm text-ink-muted">
        <Info aria-hidden {...iconDefaults} className="shrink-0" />
        {copy.note}
      </p>
      {save.isError && !notWritable && !driveGone && choice !== 'nas' ? (
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
        <Button size="lg" onClick={submit} disabled={!canContinue || save.isPending} aria-busy={save.isPending}>
          {save.isPending && choice === 'nas' ? copy.nasForm.testing : onboardingCopy.continue}
        </Button>
      </div>
    </StepFrame>
  );
}
