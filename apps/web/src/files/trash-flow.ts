// Move to Trash (US-FILE-16): on this computer items go to the Trash and a toast says so with Undo for 8 s; on a
// network drive Trash doesn't reach, so "Delete <n> items for good?" asks first. Read-only places offer neither.
import type { FileEntry } from '@hlabs/api';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { filesCopy as copy } from '../copy/files';
import { confirm } from '../lib/confirm';
import { showErrorToast } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

export const UNDO_TRASH_MS = 8_000;

export function useTrashFlow() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.files.list.pathKey() }),
    [queryClient, trpc],
  );

  /** `drive` is the network drive's name when the items are on one. */
  return useCallback(
    async (entries: FileEntry[], drive: string | null, onDone?: () => void) => {
      const n = entries.length;
      const name = entries[0]?.name ?? '';
      if (drive !== null) {
        const ok = await confirm({
          title: copy.deleteTitle(n, name),
          body: copy.deleteBody(drive),
          confirmLabel: copy.delete,
          tone: 'danger',
          onConfirm: () => client.files.delete.mutate({ paths: entries.map((e) => e.path) }),
        });
        if (!ok) return;
        onDone?.();
        await refresh();
        showToast({ tone: 'success', title: n === 1 ? copy.deletedOne(name) : copy.deletedMany(n) });
        return;
      }
      try {
        const { trashItemIds } = await client.files.trash.mutate({ paths: entries.map((e) => e.path) });
        onDone?.();
        await refresh();
        showToast({
          tone: 'success',
          title: n === 1 ? copy.movedToTrashOne(name) : copy.movedToTrashMany(n),
          durationMs: UNDO_TRASH_MS,
          actions: [
            {
              kind: 'retry',
              label: copy.undo,
              run: () =>
                void client.files.restoreFromTrash
                  .mutate({ ids: trashItemIds })
                  .then(refresh)
                  .catch((err: unknown) => showErrorToast(err)),
            },
          ],
        });
      } catch (err) {
        showErrorToast(err);
      }
    },
    [client, refresh],
  );
}
