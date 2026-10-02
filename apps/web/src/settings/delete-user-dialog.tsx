// Delete someone (US-ACCT-16): names them, says what goes and what stays, and offers to send their Home folder to the
// trash too (off by default). The last enabled admin can't be deleted; that shows inline.
import type { UserSummary } from '@hlabs/api';
import { formatBytes, keptHomeFolderName } from '@hlabs/shared';
import { Button, ModalDialog } from '@hlabs/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { peopleCopy as copy } from '../copy/people';
import { errorLine } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useNow } from '../lib/use-now';

export function DeleteUserDialog({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const [withFolder, setWithFolder] = useState(false);
  const now = useNow().getTime();
  const person = useQuery({
    ...trpc.users.get.queryOptions({ userId: user.id }),
    retry: false,
    refetchInterval: (q) => (q.state.data?.homeFolderBytes === null ? 2_000 : false),
  });
  const bytes = person.data?.homeFolderBytes ?? null;
  const name = user.displayName;

  const remove = useMutation({
    mutationFn: () => client.users.delete.mutate({ userId: user.id, deleteHomeFolder: withFolder }),
    meta: { inlineErrors: true },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.users.list.queryKey() });
      showToast({ tone: 'success', title: copy.deleted(name) });
      onClose();
    },
  });

  return (
    <ModalDialog
      open
      role="alertdialog"
      onOpenChange={(open) => (open || remove.isPending ? null : onClose())}
      dismissible={!remove.isPending}
      sheetOnPhone
      title={copy.deleteTitle(name)}
      description={copy.deleteBody(name)}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            {copy.cancel}
          </Button>
          <Button variant="destructive" busy={remove.isPending} onClick={() => remove.mutate()}>
            {copy.deleteConfirm(name)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex min-h-11 items-center gap-3 text-body text-ink">
          <input
            type="checkbox"
            className="hl-focus size-4 accent-[var(--color-accent)]"
            checked={withFolder}
            onChange={(e) => setWithFolder(e.target.checked)}
          />
          {bytes === null ? copy.deleteHomeFolderCounting : copy.deleteHomeFolder(formatBytes(bytes))}
        </label>
        <p className="m-0 text-body-sm text-ink-muted">
          {withFolder ? copy.trashedHomeFolder : copy.keptHomeFolder(keptHomeFolderName(user.username, now))}
        </p>
        {remove.isError ? (
          <p role="alert" className="m-0 text-body-sm text-danger">
            {errorLine(remove.error)}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}
