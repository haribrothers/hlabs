// Edit a backup destination (BackupEditDest, US-BKP-10, US-BKP-11): its name, and for cloud storage its keys (tested
// before saving); its type and place stay. "Show encryption password" asks for the admin's password first; "Remove
// destination" says nothing at the destination is deleted, and waits while a backup to it runs.
import { AlertTriangle, Copy, iconDefaults, Lock } from '@hlabs/icons';
import { Button, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { backupsCopy as copy } from '../copy/backups';
import { errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { ConfirmWithPassword, passwordStepError } from '../settings/confirm-with-password';
import { destinationError } from './add-destination-dialog';

interface Destination {
  id: string;
  kind: string;
  name: string;
  location: string;
  hasKeys: boolean;
  busy: boolean;
}

type View = 'edit' | 'password' | 'shown' | 'remove';

export function EditDestinationDialog({ destination, onClose }: { destination: Destination; onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('edit');
  const [name, setName] = useState(destination.name);
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.backups.overview.queryKey() });

  const save = useMutation({
    mutationFn: () =>
      client.backups.destinations.update.mutate({
        destinationId: destination.id,
        ...(name.trim() && name.trim() !== destination.name ? { name: name.trim() } : {}),
        ...(accessKey.trim() ? { accessKey: accessKey.trim() } : {}),
        ...(secretKey ? { secretKey } : {}),
      }),
    meta: { inlineErrors: true },
    onSuccess: async () => {
      await refresh();
      showToast({ tone: 'success', title: copy.saved });
      onClose();
    },
  });
  const reveal = useMutation({
    mutationFn: (password: string) =>
      client.backups.exportRepoPassword.mutate({ destinationId: destination.id, password }),
    meta: { inlineErrors: true },
    onSuccess: ({ repoPassword }) => {
      setShown(repoPassword);
      setView('shown');
    },
  });
  const remove = useMutation({
    mutationFn: () => client.backups.destinations.remove.mutate({ destinationId: destination.id }),
    meta: { inlineErrors: true },
    onSuccess: async () => {
      await refresh();
      showToast({ tone: 'success', title: copy.removed });
      onClose();
    },
  });
  const busy = save.isPending || reveal.isPending || remove.isPending;
  const kind = copy.kinds[destination.kind] ?? destination.kind;

  const title =
    view === 'password'
      ? copy.showPassword
      : view === 'shown'
        ? copy.passwordFor(destination.name)
        : view === 'remove'
          ? copy.removeTitle(destination.name)
          : copy.editTitle(destination.name);

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || busy ? null : onClose())}
      dismissible={!busy}
      sheetOnPhone
      role={view === 'remove' ? 'alertdialog' : 'dialog'}
      width={view === 'edit' ? 'min(600px, 100%)' : 'min(520px, 100%)'}
      title={title}
      actions={
        view === 'edit' ? (
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <Button variant="link" className="text-danger md:mr-auto" onClick={() => setView('remove')}>
              {copy.removeDestination}
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {copy.cancel}
            </Button>
            <Button onClick={() => save.mutate()} busy={save.isPending} disabled={!name.trim()}>
              {copy.save}
            </Button>
          </div>
        ) : view === 'shown' ? (
          <Button onClick={() => setView('edit')}>{copy.done}</Button>
        ) : view === 'remove' ? (
          <>
            <Button variant="secondary" onClick={() => setView('edit')} disabled={remove.isPending}>
              {copy.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => remove.mutate()}
              busy={remove.isPending}
              disabled={destination.busy}
              title={destination.busy ? copy.removeBusy : undefined}
            >
              {copy.remove}
            </Button>
          </>
        ) : undefined
      }
    >
      {view === 'edit' ? (
        <div className="flex flex-col gap-4 text-ink">
          <TextField label={copy.name} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-col gap-1 rounded-md bg-surface-input px-3.5 py-3">
            <span className="text-body">
              {kind} · <span className="font-mono text-body-sm">{destination.location}</span>
            </span>
            <span className="text-body-sm text-ink-muted">{copy.fixedPlace}</span>
          </div>
          {destination.hasKeys ? (
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label={copy.accessKey}
                value={accessKey}
                placeholder={copy.unchanged}
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setAccessKey(e.target.value)}
              />
              <TextField
                label={copy.secretKey}
                type="password"
                value={secretKey}
                placeholder={copy.unchanged}
                autoComplete="new-password"
                onChange={(e) => setSecretKey(e.target.value)}
              />
            </div>
          ) : null}
          <Button variant="link" className="self-start" onClick={() => setView('password')}>
            <Lock aria-hidden {...iconDefaults} className="size-4" />
            {copy.showPassword}
          </Button>
          {save.isError ? (
            <p role="alert" className="m-0 text-body-sm text-danger">
              {destinationError(save.error)}
            </p>
          ) : null}
        </div>
      ) : view === 'password' ? (
        <ConfirmWithPassword
          message={copy.showPasswordBody(destination.name)}
          confirmLabel={copy.show}
          busy={reveal.isPending}
          error={reveal.isError ? passwordStepError(reveal.error) : null}
          onCancel={() => setView('edit')}
          onConfirm={(password) => reveal.mutate(password)}
        />
      ) : view === 'shown' && shown ? (
        <div className="flex flex-col gap-4 text-ink">
          <div className="flex gap-2">
            <input
              aria-label={copy.encryptionPassword}
              readOnly
              value={shown}
              className="hl-input hl-focus min-w-0 flex-1 font-mono text-body-sm"
            />
            <Button
              variant="secondary"
              onClick={() => void navigator.clipboard?.writeText(shown).then(() => setCopied(true))}
            >
              <Copy aria-hidden {...iconDefaults} className="size-4" />
              {copied ? copy.copied : copy.copy}
            </Button>
          </div>
          <p className="m-0 flex gap-2.5 rounded-md bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3.5 py-3 text-body-sm">
            <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4.5 shrink-0 text-warning" />
            {copy.passwordKeep}
          </p>
        </div>
      ) : view === 'remove' ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-body">{copy.removeBody(destination.name)}</p>
          {destination.busy ? <p className="m-0 text-body-sm text-ink-muted">{copy.removeBusy}</p> : null}
          {remove.isError ? (
            <p role="alert" className="m-0 text-body-sm text-danger">
              {errorLine(remove.error)}
            </p>
          ) : null}
        </div>
      ) : null}
    </ModalDialog>
  );
}
