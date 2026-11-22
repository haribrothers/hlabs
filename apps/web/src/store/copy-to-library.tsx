// "Copy to my library" (CopyToLibrary, US-STORE-29), from an app's page: pick a library and a name (`<id>-custom`);
// a folder library gets the app at once and its page opens; a git library's copy downloads as a zip to add to the
// repository.
import type { AppSource } from '@hlabs/api';
import { FolderClosed, GitBranch, iconDefaults } from '@hlabs/icons';
import { Button, cn, ModalDialog, TextField } from '@hlabs/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { sourcesCopy as copy } from '../copy/store-sources';
import { browser } from '../lib/browser';
import { errorText, handledGlobally } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { shortAddress } from './sources-view';
import { useTRPC, useTRPCClient } from '../lib/trpc';

/** The admin's libraries: every source but the built-in store; undefined while they load. */
export function useLibraries(enabled: boolean) {
  const trpc = useTRPC();
  const list = useQuery({ ...trpc.store.sources.list.queryOptions(), enabled, retry: false });
  return list.data?.sources.filter((s) => s.kind !== 'builtin');
}

function LibraryChoice({ lib, checked, onPick }: { lib: AppSource; checked: boolean; onPick: () => void }) {
  const Icon = lib.kind === 'local' ? FolderClosed : GitBranch;
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3',
        checked ? 'border-accent bg-accent-wash' : 'border-border-glass bg-surface-row',
      )}
    >
      <input
        type="radio"
        name="library"
        checked={checked}
        onChange={onPick}
        className="hl-focus size-4 accent-[var(--accent)]"
      />
      <Icon aria-hidden {...iconDefaults} className="size-5 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-semibold">{lib.name}</span>
        <span className="truncate font-mono text-body-sm text-ink-muted" title={lib.url}>
          {shortAddress(lib)} · {lib.kind === 'local' ? copy.folder : copy.gitRepository}
        </span>
      </span>
    </label>
  );
}

/** The note with its folder path in mono, as in the design. */
function WithPath({ text, path }: { text: string; path: string }) {
  const at = text.indexOf(path);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <code className="font-mono">{path}</code>
      {text.slice(at + path.length)}
    </>
  );
}

export function CopyToLibrary({
  app,
  logo,
  open,
  onOpenChange,
}: {
  app: { id: string; name: string; sourceId: string };
  /** The app's logo, beside the title. */
  logo?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const client = useTRPCClient();
  const navigate = useNavigate();
  const loaded = useLibraries(open);
  const libraries = loaded ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName] = useState(`${app.id}-custom`);
  const [error, setError] = useState<string | null>(null);
  const library = libraries.find((l) => l.id === picked) ?? libraries[0];
  const folder = library?.kind === 'local';
  const path = `apps/${name.trim() || '…'}/`;

  const run = useMutation({
    mutationFn: () =>
      client.store.copyToLibrary.mutate({
        appId: app.id,
        sourceId: app.sourceId,
        libraryId: library!.id,
        newId: name.trim(),
      }),
    onSuccess: (res) => {
      onOpenChange(false);
      if (res.kind === 'folder') {
        showToast({ tone: 'success', title: copy.copied(res.appId, library!.name) });
        void navigate({ to: '/store/app/$appId', params: { appId: res.appId } });
      } else {
        browser.assign(res.url);
        showToast({ tone: 'success', title: copy.downloaded });
      }
    },
    onError: (err) => {
      if (!handledGlobally(err)) setError(errorText(err).title);
    },
  });

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-3">
          {logo ? <span aria-hidden>{logo}</span> : null}
          {copy.copyTitle(app.name)}
        </span>
      }
      actions={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {copy.cancel}
          </Button>
          <Button busy={run.isPending} disabled={!library || !name.trim()} onClick={() => run.mutate()}>
            {folder || !library ? copy.copy : copy.download}
          </Button>
        </>
      }
    >
      {!loaded ? null : libraries.length ? (
        <div className="flex flex-col gap-5">
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-body-sm font-semibold">{copy.library}</legend>
            {libraries.map((l) => (
              <LibraryChoice key={l.id} lib={l} checked={l.id === library?.id} onPick={() => setPicked(l.id)} />
            ))}
          </fieldset>
          <TextField
            label={copy.name}
            value={name}
            onChange={(e) => {
              setName(e.target.value.toLowerCase());
              setError(null);
            }}
            className="[&_input]:font-mono"
            spellCheck={false}
            autoCapitalize="off"
            error={error ?? undefined}
          />
          <p className="m-0 text-body-sm text-ink-muted">
            <WithPath text={folder ? copy.copyNote(path, library!.name) : copy.copyNoteZip(path)} path={path} />
          </p>
        </div>
      ) : (
        <p className="m-0 text-body text-ink-muted">{copy.noLibrary}</p>
      )}
    </ModalDialog>
  );
}
