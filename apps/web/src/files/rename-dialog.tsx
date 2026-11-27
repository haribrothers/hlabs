// Rename (US-FILE-23, FilesRename): the name without its extension, selected; the extension sits beside it and can't
// be edited, with a line saying why. Folders and files without one edit the whole name. New folder's rules apply. A
// folder an app uses (or that's shared on the network) says so first, and "Rename anyway" goes ahead.
import type { FileEntry } from '@hlabs/api';
import { AlertTriangle, iconDefaults } from '@hlabs/icons';
import { Button, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { filesCopy as copy } from '../copy/files';
import { errorCode, errorData, errorLine } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { cleanName } from './new-folder-dialog';
import { PhoneItemIcon } from './phone-file-list';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';
import type { FileAccent } from '@hlabs/ui/files';

/** "Lease agreement" and ".pdf"; a folder, a dotfile or a name without a dot keeps it all. */
export function splitName(entry: Pick<FileEntry, 'name' | 'kind'>): { base: string; ext: string } {
  const dot = entry.name.lastIndexOf('.');
  if (entry.kind === 'folder' || dot <= 0 || dot === entry.name.length - 1) return { base: entry.name, ext: '' };
  return { base: entry.name.slice(0, dot), ext: entry.name.slice(dot) };
}

export function RenameDialog({
  entry,
  onClose,
  onRenamed,
}: {
  entry: FileEntry;
  onClose: () => void;
  /** The new path, once it's renamed. */
  onRenamed: (path: string, name: string) => void;
}) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const phone = !useIsDesktop();
  const me = useMe(phone).data;
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const { base, ext } = splitName(entry);
  const [value, setValue] = useState(base);
  const [taken, setTaken] = useState<string | null>(null);
  const [inUse, setInUse] = useState<string[] | null>(null);
  const name = cleanName(value) === null ? null : cleanName(value.trim() + ext);
  const selected = useRef(false);
  const done = useRef<string | null>(null);

  const rename = useMutation({
    mutationFn: (v: { name: string; force: boolean }) =>
      client.files.rename.mutate({ path: entry.path, name: v.name, force: v.force || undefined }),
    meta: { inlineErrors: true },
    onSuccess: async ({ path }, v) => {
      await queryClient.invalidateQueries({ queryKey: trpc.files.list.pathKey() });
      done.current = path;
      onClose();
      onRenamed(path, v.name);
    },
    onError: (err, v) => {
      const code = errorCode(err);
      if (code === 'FILES_NAME_EXISTS') setTaken(v.name);
      if (code === 'FILES_IN_USE') {
        const apps = (errorData(err)?.detail as { apps?: string[] } | null)?.apps ?? [];
        setInUse(apps);
      }
    },
  });

  const unchanged = name === entry.name;
  const submit = () => {
    if (!name || rename.isPending || taken === name) return;
    if (unchanged) return onClose();
    rename.mutate({ name, force: inUse !== null });
  };
  const failed = rename.isError && !['FILES_NAME_EXISTS', 'FILES_IN_USE'].includes(errorCode(rename.error) ?? '');
  const error = !name
    ? copy.badName
    : taken === name
      ? copy.nameTaken(entry.kind, name)
      : failed
        ? errorLine(rename.error)
        : undefined;

  return (
    <ModalDialog
      open
      onOpenChange={(open) => (open || rename.isPending ? null : onClose())}
      dismissible={!rename.isPending}
      sheetOnPhone
      title={copy.renameTitle}
      initialFocus={input}
      finalFocus={() => document.querySelector<HTMLElement>(`[data-path="${CSS.escape(done.current ?? entry.path)}"]`)}
      // A phone (PhoneRedesignA_FilesRename): Cancel and the title in the sheet's bar, one white Rename at the bottom.
      sheetBar={{ cancelLabel: copy.cancel }}
      actions={
        <>
          {phone ? null : (
            <Button variant="secondary" onClick={onClose} disabled={rename.isPending}>
              {copy.cancel}
            </Button>
          )}
          <Button onClick={submit} busy={rename.isPending} disabled={!name || taken === name}>
            {inUse ? copy.renameAnyway : copy.rename}
          </Button>
        </>
      }
    >
      {phone ? (
        <span aria-hidden className="flex justify-center pt-2 pb-1">
          <PhoneItemIcon entry={entry} accent={(me?.appearance.accent ?? 'violet') as FileAccent} size={56} />
        </span>
      ) : null}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextField
          ref={input}
          label={<span className="sr-only">{copy.newName}</span>}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInUse(null);
          }}
          onFocus={(e) => {
            if (selected.current) return;
            selected.current = true;
            e.currentTarget.select();
          }}
          suffix={ext || undefined}
          hint={ext ? copy.extensionKept(ext) : undefined}
          error={error}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
        />
        {inUse ? (
          <p
            role="alert"
            className="m-0 flex gap-2.5 rounded-sm bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3.5 py-3 text-body-sm"
          >
            <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4.5 shrink-0 text-warning" />
            {copy.usedBy(inUse)}
          </p>
        ) : null}
      </form>
    </ModalDialog>
  );
}
