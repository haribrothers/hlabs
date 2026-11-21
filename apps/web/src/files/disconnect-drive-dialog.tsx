// Disconnect a network drive (US-FILE-12): "Disconnect <drive>?" — "Files on the drive are not deleted." While an app
// keeps folders on it, the dialog names the app and offers no Disconnect.
import { Button, ModalDialog } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { filesCopy as copy } from '../copy/files';
import { errorCode, errorData, errorLine } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';

export function DisconnectDriveDialog({
  drive,
  onClose,
  onDisconnected,
}: {
  drive: { id: string; name: string; usedBy: string[] };
  onClose: () => void;
  onDisconnected: () => void;
}) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => client.storage.locations.remove.mutate({ locationId: drive.id }),
    meta: { inlineErrors: true },
    onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.storage.locations.list.queryKey() }),
    onSuccess: () => {
      onClose();
      onDisconnected();
    },
  });
  // An app started using it since the list was fetched: the daemon names it.
  const inUse =
    errorCode(remove.error) === 'STORAGE_LOCATION_IN_USE'
      ? ((errorData(remove.error)?.detail as { apps?: string[] } | null)?.apps ?? drive.usedBy)
      : drive.usedBy;
  const blocked = inUse.length > 0;
  return (
    <ModalDialog
      open
      role="alertdialog"
      onOpenChange={(open) => (open || remove.isPending ? null : onClose())}
      dismissible={!remove.isPending}
      sheetOnPhone
      title={copy.disconnectTitle(drive.name)}
      description={blocked ? copy.usesDrive(inUse) : copy.disconnectBody}
      actions={
        blocked ? (
          <Button onClick={onClose}>{copy.ok}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
              {copy.cancel}
            </Button>
            <Button variant="destructive" busy={remove.isPending} onClick={() => remove.mutate()}>
              {copy.disconnect}
            </Button>
          </>
        )
      }
    >
      {remove.isError && !blocked ? (
        <p role="alert" className="m-0 text-body-sm text-danger">
          {errorLine(remove.error)}
        </p>
      ) : null}
    </ModalDialog>
  );
}
