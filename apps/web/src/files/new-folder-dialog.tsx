// New folder (US-FILE-03): a name, prefilled "Untitled folder" and selected; Create or Enter makes it, and the grid
// focuses it. A name that's taken, empty, has "/" or is over 255 bytes says so inline and nothing is made.
import { Button, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { filesCopy as copy } from '../copy/files';
import { errorCode, errorLine } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';

/** The name as it will be saved, or null when it can't be: empty, with "/" or over 255 bytes (US-FILE-03). */
export function cleanName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.includes('/') || name === '.' || name === '..') return null;
  return new TextEncoder().encode(name).length <= 255 ? name : null;
}

export function NewFolderDialog({
  path,
  onClose,
  onCreated,
}: {
  path: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string>(copy.untitledFolder);
  const [taken, setTaken] = useState<string | null>(null);
  const clean = cleanName(name);

  // The prefilled name is selected when the dialog gives the field focus, so typing replaces it.
  const selected = useRef(false);
  const made = useRef<string | null>(null);

  const create = useMutation({
    mutationFn: (folder: string) => client.files.mkdir.mutate({ path, name: folder }),
    meta: { inlineErrors: true },
    onSuccess: async ({ path: folder }) => {
      await queryClient.invalidateQueries({ queryKey: trpc.files.list.pathKey() });
      made.current = folder;
      onClose();
      onCreated(folder);
    },
    onError: (err, folder) => {
      if (errorCode(err) === 'FILES_NAME_EXISTS') setTaken(folder);
    },
  });

  const submit = () => {
    if (clean && !create.isPending) create.mutate(clean);
  };
  const error = !clean
    ? copy.badName
    : taken === clean
      ? copy.nameExists(clean)
      : create.isError && errorCode(create.error) !== 'FILES_NAME_EXISTS'
        ? errorLine(create.error)
        : undefined;

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || create.isPending ? null : onClose())}
      dismissible={!create.isPending}
      sheetOnPhone
      title={copy.newFolderTitle}
      initialFocus={input}
      // Focus goes to the new folder, not back to New folder.
      finalFocus={() =>
        made.current ? document.querySelector<HTMLElement>(`[data-path="${CSS.escape(made.current)}"]`) : null
      }
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {copy.cancel}
          </Button>
          <Button onClick={submit} busy={create.isPending} disabled={!clean || taken === clean}>
            {copy.create}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          ref={input}
          label={copy.folderName}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => {
            if (selected.current) return;
            selected.current = true;
            e.currentTarget.select();
          }}
          error={error}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
        />
      </form>
    </ModalDialog>
  );
}
