// Move to (US-FILE-22, FilesMove): "Move 3 items to…" with a folder tree from Home (the current folder marked
// "current"), Shared and the drives this person can write to; folders load as they open. "Move to <folder>" is off for
// the current folder and for any folder being moved (or inside one). "+ New folder" makes one inside the selected
// folder and selects it. On a phone it's a full-height sheet (PhoneFilesMove).
import type { FileEntry } from '@hlabs/api';
import { ChevronRight, iconDefaults } from '@hlabs/icons';
import { FileIcon } from '@hlabs/icons/files';
import { Button, ModalDialog } from '@hlabs/ui';
import type { FileAccent } from '@hlabs/ui/files';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type KeyboardEvent } from 'react';
import { filesCopy as copy } from '../copy/files';
import { useTRPC } from '../lib/trpc';
import { NewFolderDialog } from './new-folder-dialog';

export interface MoveRoot {
  path: string;
  name: string;
}

/** Every folder from a root down to `path` ("/home", "/home/Documents"), so the tree opens at the current folder. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  return parts.map((_, i) => `/${parts.slice(0, i + 1).join('/')}`);
}

/** Where the items can't go: the folder they're in, a folder being moved, or one inside it. */
export function blockedTarget(target: string, from: string, moving: FileEntry[]): boolean {
  if (target === from) return true;
  return moving.some((e) => e.kind === 'folder' && (target === e.path || target.startsWith(`${e.path}/`)));
}

interface TreeCtx {
  from: string;
  accent: FileAccent;
  expanded: Set<string>;
  selected: string | null;
  select: (path: string, name: string) => void;
  toggle: (path: string, open?: boolean) => void;
}

function Node({ path, name, depth, ctx }: { path: string; name: string; depth: number; ctx: TreeCtx }) {
  const trpc = useTRPC();
  const open = ctx.expanded.has(path);
  const children = useQuery({
    ...trpc.files.list.queryOptions({ path, kinds: ['folder'] }),
    enabled: open,
    retry: false,
    staleTime: 30_000,
  });
  const items = children.data?.items ?? [];
  const selected = ctx.selected === path;
  return (
    <>
      <button
        type="button"
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={open}
        aria-selected={selected}
        data-tree-path={path}
        tabIndex={selected || (ctx.selected === null && depth === 0 && path === '/home') ? 0 : -1}
        className={`hl-focus flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-sm border-0 py-2 pr-3.5 text-left text-body text-ink ${
          selected ? 'bg-accent-wash' : 'bg-transparent hover:bg-surface-row'
        }`}
        style={{ paddingLeft: `${14 + depth * 22}px` }}
        onClick={() => {
          ctx.select(path, name);
          ctx.toggle(path, true);
        }}
      >
        <ChevronRight
          aria-hidden
          {...iconDefaults}
          className={`size-3.5 shrink-0 text-ink-muted transition-transform ${open ? 'rotate-90' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            ctx.toggle(path);
          }}
        />
        <FileIcon folder path={path} accent={ctx.accent} size={20} />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {path === ctx.from ? <span className="text-caption text-ink-muted">{copy.current}</span> : null}
      </button>
      {open ? items.map((c) => <Node key={c.path} path={c.path} name={c.name} depth={depth + 1} ctx={ctx} />) : null}
      {open && children.isLoading ? (
        <p className="m-0 py-2 text-body-sm text-ink-muted" style={{ paddingLeft: `${36 + (depth + 1) * 22}px` }}>
          {copy.picker.loading}
        </p>
      ) : null}
    </>
  );
}

export function MoveDialog({
  entries,
  from,
  roots,
  accent,
  onClose,
  onMove,
}: {
  entries: FileEntry[];
  /** The folder they're in now. */
  from: string;
  roots: MoveRoot[];
  accent: FileAccent;
  onClose: () => void;
  onMove: (to: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(() => new Set(ancestorsOf(from)));
  const [selected, setSelected] = useState<{ path: string; name: string } | null>(null);
  const [making, setMaking] = useState(false);
  const tree = useRef<HTMLDivElement>(null);
  const blocked = !selected || blockedTarget(selected.path, from, entries);
  const title = entries.length === 1 ? copy.moveOne(entries[0]!.name) : copy.moveMany(entries.length);

  const ctx: TreeCtx = {
    from,
    accent,
    expanded,
    selected: selected?.path ?? null,
    select: (path, name) => setSelected({ path, name }),
    toggle: (path, open) =>
      setExpanded((s) => {
        const next = new Set(s);
        if (open ?? !next.has(path)) next.add(path);
        else next.delete(path);
        return next;
      }),
  };

  // Up and Down move through the rows shown; Right opens a folder, Left closes it.
  const onKeyDown = (e: KeyboardEvent) => {
    const rows = [...(tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const path = rows[at]!.dataset.treePath!;
    let next = -1;
    if (e.key === 'ArrowDown') next = at + 1;
    else if (e.key === 'ArrowUp') next = at - 1;
    else if (e.key === 'ArrowRight') ctx.toggle(path, true);
    else if (e.key === 'ArrowLeft') ctx.toggle(path, false);
    else return;
    e.preventDefault();
    const el = rows[next];
    if (el) el.focus();
  };

  return (
    <>
      <ModalDialog
        open
        onOpenChange={(open) => (open ? null : onClose())}
        sheetOnPhone
        tall
        title={title}
        actions={
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <Button
              variant="secondary"
              size="sm"
              className="md:mr-auto"
              disabled={!selected}
              onClick={() => setMaking(true)}
            >
              {copy.picker.newFolder}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {copy.cancel}
            </Button>
            <Button disabled={blocked} onClick={() => selected && onMove(selected.path, selected.name)}>
              {selected ? copy.moveToFolder(selected.name) : copy.moveTo}
            </Button>
          </div>
        }
      >
        <div
          ref={tree}
          role="tree"
          aria-label={copy.folders}
          onKeyDown={onKeyDown}
          className="max-h-[50dvh] overflow-y-auto rounded-md bg-surface-row p-1.5 max-md:max-h-none"
        >
          {roots.map((r) => (
            <Node key={r.path} path={r.path} name={r.name} depth={0} ctx={ctx} />
          ))}
        </div>
      </ModalDialog>
      {making && selected ? (
        <NewFolderDialog
          path={selected.path}
          onClose={() => setMaking(false)}
          onCreated={(path) => {
            ctx.toggle(selected.path, true);
            setSelected({ path, name: path.slice(path.lastIndexOf('/') + 1) });
          }}
        />
      ) : null}
    </>
  );
}
