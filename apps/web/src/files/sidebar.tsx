import {
  Clock,
  Download,
  Folder,
  HardDrive,
  House,
  iconDefaults,
  Image,
  Monitor,
  Package,
  Plus,
  Server,
  Trash2,
  Users,
} from '@hlabs/icons';
// The Files sidebar (US-FILE-01, FilesBrowser): places in three groups, drive status, "Connect a drive" and the
// storage bar for admins. On a phone the same places are a row of chips above the folder (PhoneFiles).
import type { FileEntry } from '@hlabs/api';
import { dragged, endDrag, isItemDrag } from './drag';
import { formatBytes } from '@hlabs/shared';
import { cn, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, StatusDot } from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { useEventStream } from '../lib/use-event-stream';
import { useTRPC } from '../lib/trpc';
import { activeRow, sidebarGroups, type Drive, type FilesLocation, type SidebarRow } from './places';

/** Each place's icon (Lucide, stroke 2): a network drive is a server, any other drive a disk. */
export function placeIcon(row: SidebarRow): ReactNode {
  const props = { 'aria-hidden': true, ...iconDefaults, className: 'size-4.5 shrink-0 text-ink-muted' } as const;
  if (row.driveId)
    return row.driveKind === 'smb' || row.driveKind === 'nfs' ? <Server {...props} /> : <HardDrive {...props} />;
  switch (row.key) {
    case 'recents':
      return <Clock {...props} />;
    case 'home':
      return <House {...props} />;
    case 'photos':
      return <Image {...props} />;
    case 'downloads':
      return <Download {...props} />;
    case 'shared':
      return <Users {...props} />;
    case 'computer':
      return <Monitor {...props} />;
    case 'appdata':
      return <Package {...props} />;
    case 'trash':
      return <Trash2 {...props} />;
    default:
      return <Folder {...props} />;
  }
}

const ROW =
  'hl-focus flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-body text-ink no-underline hover:bg-surface-control aria-[current=page]:bg-surface-control aria-[current=page]:font-semibold';

/** Up/Down move between rows (as Settings' sidebar). */
function moveInList(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('a, button')];
  const at = rows.indexOf(document.activeElement as HTMLElement);
  const next = rows[at + (e.key === 'ArrowDown' ? 1 : -1)];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

/** Storage locations and the storage bar are admin-only (US-FILE-01). */
export function useDrives(admin: boolean): Drive[] {
  const trpc = useTRPC();
  const q = useQuery({ ...trpc.storage.locations.list.queryOptions(), enabled: admin, staleTime: 10_000 });
  return admin ? ((q.data?.locations ?? []) as Drive[]) : [];
}

/** A drive connected, disconnected, mounted or gone offline (US-FILE-12): the sidebar and open folder follow. */
export function DriveEvents() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  useEventStream((event) => {
    if (event.type !== 'storage.locationChanged') return;
    void queryClient.invalidateQueries({ queryKey: trpc.storage.locations.list.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.files.list.pathKey() });
  });
  return null;
}

/** A drive's row: right-click (or the context-menu key, or a long press) opens its menu with Disconnect (US-FILE-12). */
function DriveRow({ row, current, onDisconnect }: { row: SidebarRow; current: boolean; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <span
          className="block"
          aria-label={copy.driveMenu(row.label)}
          // A click follows the link; only the context menu opens the menu.
          onPointerDown={(e) => e.preventDefault()}
          onContextMenu={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
        >
          <RowLink row={row} current={current} />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuItem danger onSelect={onDisconnect}>
          {copy.disconnect}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RowLink({ row, current }: { row: SidebarRow; current: boolean }) {
  const label = row.offline ? (
    <StatusDot status="stopped">
      {row.label}
      <span className="sr-only"> · {copy.offline}</span>
    </StatusDot>
  ) : (
    row.label
  );
  return (
    <Link
      to="/files"
      search={row.path === null ? { view: row.view ?? 'recents' } : { path: row.path }}
      className={ROW}
      aria-current={current ? 'page' : undefined}
      // Enter and Space follow the link and never open a drive's menu.
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' ? e.stopPropagation() : undefined)}
    >
      {placeIcon(row)}
      {label}
    </Link>
  );
}

function StorageBar() {
  const trpc = useTRPC();
  const summary = useQuery({ ...trpc.storage.summary.queryOptions(), staleTime: 60_000 }).data;
  if (!summary || summary.totalBytes <= 0) return null;
  const used = summary.totalBytes - summary.freeBytes;
  const pct = Math.round((used / summary.totalBytes) * 100);
  const text = copy.storageUsed(formatBytes(used), formatBytes(summary.totalBytes));
  return (
    <div className="px-3">
      <div
        className="h-1 overflow-hidden rounded-pill bg-surface-control"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={text}
      >
        <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="m-0 mt-2 text-caption text-ink-muted">{text}</p>
    </div>
  );
}

/** A sidebar place items can be dropped on (US-FILE-22): not Recents, This computer or App data. */
export const droppable = (row: SidebarRow) =>
  row.path !== null && row.path !== '/users' && !row.path.startsWith('/appdata') && !row.offline;

export function FilesSidebar({
  me,
  at,
  onConnect,
  onDisconnect,
  onDropItems,
}: {
  /** Items dragged onto a place move there (US-FILE-22). */
  onDropItems?: (entries: FileEntry[], from: string, to: string, name: string) => void;
  me: { role: 'admin' | 'member'; canSeeShared: boolean };
  at: FilesLocation;
  onConnect: () => void;
  onDisconnect: (driveId: string) => void;
}) {
  const admin = me.role === 'admin';
  const groups = sidebarGroups(me, useDrives(admin));
  const active = activeRow(at);
  const [over, setOver] = useState<string | null>(null);
  const dropProps = (r: SidebarRow) =>
    onDropItems && droppable(r)
      ? {
          onDragOver: (e: DragEvent) => {
            if (!isItemDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOver(r.key);
          },
          onDragLeave: () => setOver(null),
          onDrop: (e: DragEvent) => {
            if (!isItemDrag(e)) return;
            e.preventDefault();
            setOver(null);
            const d = dragged();
            endDrag();
            if (d && d.from !== r.path) onDropItems(d.entries, d.from, r.path!, r.label);
          },
        }
      : {};
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label={copy.places} onKeyDown={moveInList} className="min-h-0 flex-1 overflow-y-auto pb-4">
        {groups.map((g) => (
          <div key={g.key} className={cn(g.key !== 'files' && 'mt-4')}>
            {g.key === 'files' ? null : (
              <h2 className="m-0 mb-1 px-3 text-caption font-semibold uppercase tracking-wide text-ink-muted">
                {g.label}
              </h2>
            )}
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {g.rows.map((r) => (
                <li
                  key={r.key}
                  className={over === r.key ? 'rounded-sm bg-accent-wash ring-2 ring-accent' : undefined}
                  {...dropProps(r)}
                >
                  {r.driveId ? (
                    <DriveRow row={r} current={active === r.key} onDisconnect={() => onDisconnect(r.driveId!)} />
                  ) : (
                    <RowLink row={r} current={active === r.key} />
                  )}
                </li>
              ))}
              {g.connect ? (
                <li>
                  <button type="button" className={cn(ROW, 'border-0 bg-transparent font-sans')} onClick={onConnect}>
                    <Plus aria-hidden {...iconDefaults} className="size-4.5 shrink-0 text-ink-muted" />
                    {copy.connectDrive.replace(/^\+ /, '')}
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </nav>
      {admin ? (
        <>
          <StorageBar />
          <DriveEvents />
        </>
      ) : null}
    </div>
  );
}

/** Phone: the places as a scrolling row of chips (PhoneFiles). */
export function FilesChips({ me, at }: { me: { role: 'admin' | 'member'; canSeeShared: boolean }; at: FilesLocation }) {
  const admin = me.role === 'admin';
  const rows = sidebarGroups(me, useDrives(admin)).flatMap((g) => g.rows);
  const active = activeRow(at);
  const nav = useRef<HTMLElement>(null);
  // The open place's chip scrolls into view (Trash is at the end, PhoneFilesTrash).
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [active]);
  return (
    <nav ref={nav} aria-label={copy.places} className="-mx-4 shrink-0 overflow-x-auto px-4">
      <ul className="m-0 flex list-none gap-2 p-0">
        {rows.map((r) => (
          <li key={r.key} className="shrink-0">
            <Link
              to="/files"
              search={r.path === null ? { view: r.view ?? 'recents' } : { path: r.path }}
              aria-current={active === r.key ? 'page' : undefined}
              className="hl-focus inline-flex min-h-11 items-center rounded-pill bg-surface-control px-4 text-body text-ink no-underline aria-[current=page]:bg-fill-primary aria-[current=page]:font-semibold aria-[current=page]:text-ink-on-light"
            >
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
