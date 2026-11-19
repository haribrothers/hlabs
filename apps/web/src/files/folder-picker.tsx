// Choose a folder for an app (US-FILE-25, FolderPicker): places on the left (Home, Shared, drives that let apps use
// them; offline ones can't be opened), the open folder's folders on the right, A to Z, under a breadcrumb. A click
// selects, a double-click, Enter or › opens; on a phone a tap opens. "Use <folder>" takes the selected folder, or the
// open one; a folder the app writes to can't be on a read-only place. "+ New folder" makes one here and selects it.
// What's chosen is sent as the install's `mounts` (the daemon checks it again).
import { ChevronRight, iconDefaults, Lock, X } from '@hlabs/icons';
import { FileIcon } from '@hlabs/icons/files';
import { Button, ModalDialog, cn } from '@hlabs/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { filesCopy } from '../copy/files';
import { installCopy } from '../copy/install';
import { errorCode, errorLine } from '../lib/error-copy';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { NewFolderDialog } from './new-folder-dialog';
import { crumbName, joinPath, parentOf, pickerPlaces, placeOfPath, type FilesMe } from './places';
import { useDrives } from './sidebar';

const copy = filesCopy.picker;

/** A folder chosen in the picker: where it is for the install (`mounts`) and for people ("NAS · Media › Photos"). */
export interface ChosenFolder {
  storageLocationId: string;
  subpath: string;
  label: string;
  /** Its path in Files, where the picker opens next time. */
  path: string;
}

export function FolderPicker({
  appName,
  folder,
  start,
  onClose,
  onChoose,
}: {
  appName: string;
  /** The manifest folder being chosen: its name and whether the app writes to it. */
  folder: { label: string; mode: 'ro' | 'rw' };
  /** Where it opens: the folder's current place (its parent, or further up, when that doesn't exist yet). */
  start: string;
  onClose: () => void;
  onChoose: (chosen: ChosenFolder) => void;
}) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const me = useMe().data;
  const admin = me?.role === 'admin';
  const drives = useDrives(admin);
  const places = useMemo(
    () => pickerPlaces({ role: me?.role ?? 'member', canSeeShared: !!me?.canSeeShared }, drives),
    [me?.role, me?.canSeeShared, drives],
  );
  const desktop = useIsDesktop();
  const [path, setPath] = useState(start);
  const [selected, setSelected] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const focusOnLoad = useRef<string | null>(null);

  const place = placeOfPath(places, path);
  // A folder that doesn't exist yet opens its parent, or further up (US-FILE-25); later pages follow the first.
  const q = useInfiniteQuery({
    queryKey: [...trpc.files.list.pathKey(), { picker: path }],
    initialPageParam: null as { path: string; cursor: string } | null,
    queryFn: async ({ pageParam }) => {
      if (pageParam) return client.files.list.query({ ...pageParam, kinds: ['folder'] });
      for (let at = path; ; at = parentOf(at)) {
        try {
          return await client.files.list.query({ path: at, kinds: ['folder'] });
        } catch (err) {
          if (errorCode(err) !== 'NOT_FOUND' || !place || at === place.path) throw err;
        }
      }
    },
    getNextPageParam: (p) => (p.nextCursor ? { path: p.path, cursor: p.nextCursor } : undefined),
    enabled: !!place && !place.offline,
    meta: { inlineErrors: true },
    retry: false,
  });
  // Every page, as Files does: a picker lists all the folders.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const first = q.data?.pages[0];
  /** The folder open: where the picker asked for, or the folder above it that exists. */
  const current = first?.path ?? path;
  const folders = q.data?.pages.flatMap((p) => p.items) ?? [];
  const here = first ? crumbName(first.crumbs.at(-1)!) : (place?.label ?? '');
  const readOnly = !!first?.place.readOnly;
  const blocked = folder.mode === 'rw' && readOnly;
  const chosenName = selected ?? here;

  // After opening a folder by keyboard, focus goes to its first folder (or the list).
  useEffect(() => {
    if (!first || focusOnLoad.current !== first.path) return;
    focusOnLoad.current = null;
    list.current?.querySelector<HTMLElement>('[role="option"]')?.focus();
  }, [first]);

  const open = (to: string, byKeyboard = false) => {
    setSelected(null);
    focusOnLoad.current = byKeyboard ? to : null;
    setPath(to);
  };

  const use = () => {
    if (!first?.location || blocked) return;
    const crumbs = first.crumbs.map(crumbName);
    const sub = first.location.subpath;
    onChoose(
      selected
        ? {
            storageLocationId: first.location.id,
            subpath: sub ? `${sub}/${selected}` : selected,
            label: installCopy.place([...crumbs, selected]),
            path: joinPath(current, selected),
          }
        : { storageLocationId: first.location.id, subpath: sub, label: installCopy.place(crumbs), path: current },
    );
  };

  // Arrow keys move between folders, Enter opens (US-FILE-25); Escape is the dialog's.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const options = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const at = options.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => {
      const next = options[Math.max(0, Math.min(options.length - 1, i))];
      if (!next) return;
      next.focus();
      if (desktop) setSelected(next.dataset.name ?? null);
    };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(options.length - 1);
    else if (e.key === 'Enter' && at >= 0) open(options[at]!.dataset.path!, true);
    else return;
    e.preventDefault();
  };

  return (
    <>
      <ModalDialog
        open
        onOpenChange={(o) => (o ? null : onClose())}
        sheetOnPhone
        tall
        width="min(760px, 100%)"
        title={
          <span className="flex items-start gap-3">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span>{copy.title(appName)}</span>
              <span className="text-body-sm font-normal text-ink-muted">
                {copy.forLine(folder.label, installCopy.folderMode[folder.mode])}
              </span>
            </span>
            {/* On a phone the sheet closes from its corner, leaving New folder and Use side by side (PhoneFolderPicker). */}
            {desktop ? null : (
              <button
                type="button"
                aria-label={filesCopy.cancel}
                onClick={onClose}
                className="hl-focus flex size-11 shrink-0 items-center justify-center rounded-pill border-0 bg-surface-control text-ink"
              >
                <X aria-hidden {...iconDefaults} className="size-4" />
              </button>
            )}
          </span>
        }
        actions={
          <div className="flex w-full flex-wrap items-center gap-3">
            {blocked ? (
              <p
                role="status"
                className="m-0 flex items-center justify-center gap-1.5 text-body-sm text-ink max-md:order-first max-md:w-full"
              >
                <Lock aria-hidden {...iconDefaults} className="size-3.5" />
                {copy.readOnly}
              </p>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => setMaking(true)}
              disabled={!first || readOnly}
              className="shrink-0 md:order-first md:mr-auto"
            >
              {copy.newFolder}
            </Button>
            {desktop ? (
              <Button variant="secondary" onClick={onClose}>
                {filesCopy.cancel}
              </Button>
            ) : null}
            <Button onClick={use} disabled={!first?.location || blocked} className="min-w-0 truncate max-md:flex-1">
              {copy.use(chosenName)}
            </Button>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row md:gap-5">
          <Places places={places} current={place?.key ?? null} desktop={desktop} onOpen={(p) => open(p)} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <PickerCrumbs crumbs={first?.crumbs ?? []} onOpen={(p) => open(p)} desktop={desktop} />
            <div
              ref={list}
              role="listbox"
              aria-label={copy.folders(here)}
              aria-busy={q.isPending || undefined}
              onKeyDown={onKeyDown}
              className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto rounded-lg bg-surface-input p-1.5"
            >
              {q.isError ? (
                <p role="alert" className="m-auto p-6 text-center text-body-sm text-ink">
                  {errorLine(q.error)}
                </p>
              ) : !first ? (
                <p role="status" className="m-auto text-body-sm text-ink-muted">
                  {copy.loading}
                </p>
              ) : folders.length === 0 ? (
                <div className="m-auto flex flex-col items-center gap-1.5 p-6 text-center">
                  <span className="text-body font-semibold text-ink">{copy.empty(here)}</span>
                  <span className="text-body-sm text-ink-muted">{copy.emptyHint}</span>
                </div>
              ) : (
                folders.map((f, i) => {
                  const isSelected = desktop && selected === f.name;
                  return (
                    <div
                      key={f.path}
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={isSelected || (!selected && i === 0) ? 0 : -1}
                      data-name={f.name}
                      data-path={f.path}
                      onClick={() => (desktop ? setSelected(f.name) : open(f.path))}
                      onDoubleClick={() => open(f.path)}
                      className={cn(
                        'hl-focus flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-md py-0 pl-3.5 pr-1.5 text-body text-ink hover:bg-surface-control',
                        isSelected && 'bg-accent-wash hover:bg-accent-wash',
                      )}
                    >
                      <FileIcon folder path={f.path} accent={me?.appearance.accent as FilesMe['accent']} size={24} />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span
                        aria-hidden
                        onClick={(e) => {
                          e.stopPropagation();
                          open(f.path);
                        }}
                        className="flex size-8 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-control hover:text-ink"
                      >
                        <ChevronRight {...iconDefaults} className="size-4" />
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </ModalDialog>
      {making ? (
        <NewFolderDialog
          path={current}
          onClose={() => setMaking(false)}
          onCreated={(made) => {
            const name = made.slice(made.lastIndexOf('/') + 1);
            if (desktop) setSelected(name);
            else open(made);
          }}
        />
      ) : null}
    </>
  );
}

/** Home, Shared and the drives: a column on desktop, chips on a phone. Offline drives say so and don't open. */
function Places({
  places,
  current,
  desktop,
  onOpen,
}: {
  places: ReturnType<typeof pickerPlaces>;
  current: string | null;
  desktop: boolean;
  onOpen: (path: string) => void;
}) {
  return (
    <nav
      aria-label={copy.places}
      className={cn(
        'shrink-0',
        desktop ? 'flex w-52 flex-col gap-0.5' : '-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]',
      )}
    >
      {desktop ? (
        <h3 className="m-0 mb-1 px-3 text-caption font-semibold uppercase tracking-wide text-ink-muted">
          {copy.places}
        </h3>
      ) : null}
      {places.map((p) => {
        const on = p.key === current;
        return (
          <button
            key={p.key}
            type="button"
            aria-current={on ? 'location' : undefined}
            aria-disabled={p.offline || undefined}
            onClick={() => (p.offline ? null : onOpen(p.path))}
            className={cn(
              'hl-focus flex shrink-0 items-center gap-2.5 border-0 font-sans text-body text-ink',
              desktop
                ? 'min-h-10 w-full rounded-md bg-transparent px-3 text-left hover:bg-surface-control'
                : 'min-h-11 rounded-pill bg-surface-control px-4 whitespace-nowrap',
              on && (desktop ? 'bg-surface-control font-semibold' : 'bg-fill-primary font-semibold text-ink-on-light'),
              p.offline ? 'cursor-default opacity-55' : 'cursor-pointer',
            )}
          >
            {desktop ? <FileIcon folder path={p.path} size={20} /> : null}
            <span className="min-w-0 flex-1 truncate">{p.label}</span>
            {p.offline || p.readOnly ? (
              <span className="text-caption font-semibold text-ink-muted">
                {p.offline ? filesCopy.offline : copy.readOnlyTag}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

/** "Home › Photos": each step opens its folder; the last is where the picker is. On a phone, ‹ goes up one. */
function PickerCrumbs({
  crumbs,
  onOpen,
  desktop,
}: {
  crumbs: Array<{ path: string; name: string | null }>;
  onOpen: (path: string) => void;
  desktop: boolean;
}) {
  if (!crumbs.length) return <div className="min-h-7" />;
  const parent = crumbs.at(-2);
  return (
    <nav aria-label={filesCopy.breadcrumb} className="flex min-h-7 min-w-0 items-center gap-1">
      {!desktop && parent ? (
        <button
          type="button"
          aria-label={copy.up(crumbName(parent))}
          onClick={() => onOpen(parent.path)}
          className="hl-focus -ml-2 flex size-11 shrink-0 items-center justify-center rounded-pill border-0 bg-transparent text-ink"
        >
          <ChevronRight aria-hidden {...iconDefaults} className="size-5 rotate-180" />
        </button>
      ) : null}
      <ol className="m-0 flex min-w-0 list-none flex-wrap items-center gap-2 p-0 text-body font-bold">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex min-w-0 items-center gap-2">
            {i > 0 ? <ChevronRight aria-hidden {...iconDefaults} className="size-4 shrink-0 text-ink-muted" /> : null}
            {i === crumbs.length - 1 ? (
              <span aria-current="location" className="truncate text-ink">
                {crumbName(c)}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onOpen(c.path)}
                className="hl-focus truncate rounded-xs border-0 bg-transparent p-0 font-sans font-bold text-ink-muted hover:text-ink"
              >
                {crumbName(c)}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
