// The Files window (FilesBrowser, 07-files): places on the left, the open folder (or Recents) on the right. On a
// phone the places are chips above the folder. Escape closes the window, as Settings does.
import type { FileEntry } from '@hlabs/api';
import { GlassCard } from '@hlabs/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { filesCopy as copy } from '../copy/files';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';
import { FolderView, type FilesMe } from './folder-view';
import { HOME, type FilesLocation } from './places';
import { RecentsView } from './recents-view';
import { FilePreview } from './file-preview';
import { NewFolderDialog } from './new-folder-dialog';
import { OpenWith } from './open-with';
import { useFileUploads } from './use-file-uploads';
import { SearchField, useDebouncedQuery } from './search';
import { FilesChips, FilesSidebar, useDrives } from './sidebar';
import { ConnectDriveDialog } from './connect-drive-dialog';
import { DisconnectDriveDialog } from './disconnect-drive-dialog';
import { useTRPCClient } from '../lib/trpc';
import { FolderToolbar, ViewToggle } from './toolbar';
import { useFilesView } from './view-prefs';
import { RenameDialog } from './rename-dialog';
import { useMoveFlow } from './move-flow';
import { useTrashFlow } from './trash-flow';
import type { MoveRoot } from './move-dialog';
import { isFeatureEnabled } from '@hlabs/shared';

export interface FilesPageProps {
  at: FilesLocation;
}

/** Where Files is, from `/files?path=…` or `/files?view=recents` (US-FILE-02: back and forward move between folders). */
export function locationOf(search: Record<string, unknown>): FilesLocation {
  if (search.view === 'recents') return { path: '', view: 'recents' };
  const path = typeof search.path === 'string' && search.path.startsWith('/') ? search.path : HOME;
  return { path, view: 'folder' };
}

/** "Documents" for the phone's "Search in Documents"; the tops of places by their names, a drive's top as "Files". */
export function placeName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 1) return copy.areaNames[path] ?? copy.title;
  if (parts[0] === 'drives' && parts.length === 2) return copy.title;
  return parts.at(-1) ?? copy.title;
}

/** The page, at the location in the URL. */
export function FilesScreen() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  return <FilesPage at={locationOf(search)} />;
}

export function FilesPage({ at }: FilesPageProps) {
  const me = useMe();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const drives = useDrives(me.data?.role === 'admin');
  const trpcClient = useTRPCClient();
  const [newFolder, setNewFolder] = useState(false);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ entry: FileEntry; items: FileEntry[] } | null>(null);
  const [renaming, setRenaming] = useState<FileEntry | null>(null);
  // The search belongs to the folder it was typed in: opening another one clears it.
  const [search, setSearch] = useState({ path: at.path, text: '' });
  const searchText = search.path === at.path ? search.text : '';
  const searchQuery = useDebouncedQuery(searchText);
  const uploads = useFileUploads();
  const folderPath = at.path || HOME;
  const prefs = useFilesView();
  // Where Move to can put things (US-FILE-22): Home, Shared when this person sees it, drives hlabs can write to.
  const moveRoots: MoveRoot[] = [
    { path: HOME, name: copy.home },
    ...(me.data?.canSeeShared ? [{ path: '/shared', name: copy.sharedWithMe }] : []),
    ...drives
      .filter((d) => !d.isRoot && d.status === 'ok' && !d.readOnly)
      .map((d) => ({ path: `/drives/${d.id}`, name: d.name })),
  ];
  const mover = useMoveFlow({ roots: moveRoots, accent: me.data?.appearance.accent ?? 'violet' });
  const canMove = isFeatureEnabled('filesMove');
  const trashItems = useTrashFlow();
  const canTrash = isFeatureEnabled('filesTrash');
  /** A network drive's name for a path on one (Trash doesn't reach it), else null. */
  const driveOf = (path: string) => {
    const id = /^\/drives\/([^/]+)/.exec(path)?.[1];
    return id ? (drives.find((d) => d.id === id)?.name ?? '') : null;
  };

  useEffect(() => {
    document.title = copy.docTitle;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        return;
      }
      void navigate({ to: '/' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (!me.data) return null;
  const filesMe: FilesMe = {
    role: me.data.role,
    displayName: me.data.displayName,
    canSeeShared: me.data.canSeeShared,
    accent: me.data.appearance.accent,
  };
  const disconnectDrive = drives.find((d) => d.id === disconnecting);
  const onOpenFile = (entry: FileEntry, items: FileEntry[]) => setPreview({ entry, items });

  const main: ReactNode =
    at.view === 'recents' ? (
      <RecentsView me={filesMe} onOpenFile={onOpenFile} />
    ) : (
      <FolderView
        path={at.path || HOME}
        me={filesMe}
        onOpenFile={onOpenFile}
        focusPath={focusPath}
        searchQuery={searchQuery}
        view={prefs.view}
        sort={prefs.sort}
        onSort={prefs.sortBy}
        selectionActions={(entries, clear, readOnly) =>
          canMove && !readOnly ? { onMove: () => mover.choose(entries, folderPath, clear) } : {}
        }
        onDropItems={canMove ? (entries, from, to) => mover.move(entries, from, to.path, to.name) : undefined}
        onTrashItems={
          canTrash
            ? (entries, place, done) =>
                void trashItems(entries, place.area === 'drive' ? (place.name ?? '') : null, done)
            : undefined
        }
        search={
          <SearchField
            value={searchText}
            onChange={(text) => setSearch({ path: at.path, text })}
            place={placeName(at.path)}
          />
        }
        toolbar={(place, folderName) => (
          <>
            <ViewToggle view={prefs.view} onChange={prefs.setView} />
            <FolderToolbar
              readOnly={place.readOnly}
              onNewFolder={() => setNewFolder(true)}
              onUpload={() => uploads.choose(folderPath, folderName)}
            />
          </>
        )}
        onRetryDrive={async (locationId) => {
          await trpcClient.storage.locations.reconnect.mutate({ locationId });
        }}
        onDropFiles={(data, folderName) => uploads.drop(data, folderPath, folderName)}
        notice={(folderName) => uploads.notice(folderPath, folderName)}
      />
    );
  const dialogs = (
    <>
      {uploads.ui}
      {mover.ui}
      {preview ? (
        <FilePreview
          entry={preview.entry}
          items={preview.items}
          onNavigate={(entry) => setPreview({ ...preview, entry })}
          onClose={() => setPreview(null)}
          openWith={<OpenWith path={preview.entry.path} />}
          menu={(entry, readOnly) =>
            readOnly
              ? []
              : [
                  ...(isFeatureEnabled('filesRename')
                    ? [{ label: copy.renameItem, onSelect: () => setRenaming(entry) }]
                    : []),
                  ...(canMove
                    ? [
                        {
                          label: copy.moveTo,
                          onSelect: () => {
                            setPreview(null);
                            mover.choose([entry], entry.path.slice(0, entry.path.lastIndexOf('/')));
                          },
                        },
                      ]
                    : []),
                  ...(canTrash
                    ? [
                        {
                          label: copy.moveToTrash,
                          danger: true,
                          onSelect: () => {
                            setPreview(null);
                            void trashItems([entry], driveOf(entry.path));
                          },
                        },
                      ]
                    : []),
                ]
          }
        />
      ) : null}
      {renaming ? (
        <RenameDialog
          entry={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={(path, name) => {
            // The preview follows the file to its new name.
            const renamed = (e: FileEntry) => (e.path === renaming.path ? { ...e, path, name } : e);
            setPreview((p) => (p ? { entry: renamed(p.entry), items: p.items.map(renamed) } : p));
          }}
        />
      ) : null}
      {connecting ? (
        <ConnectDriveDialog
          onClose={() => setConnecting(false)}
          onConnected={(id) => void navigate({ to: '/files', search: { path: `/drives/${id}` } })}
        />
      ) : null}
      {disconnectDrive ? (
        <DisconnectDriveDialog
          drive={{ id: disconnectDrive.id, name: disconnectDrive.name, usedBy: disconnectDrive.usedBy ?? [] }}
          onClose={() => setDisconnecting(null)}
          onDisconnected={() => {
            if (at.path.startsWith(`/drives/${disconnectDrive.id}`))
              void navigate({ to: '/files', search: { path: HOME } });
          }}
        />
      ) : null}
      {newFolder && at.view === 'folder' ? (
        <NewFolderDialog path={at.path || HOME} onClose={() => setNewFolder(false)} onCreated={setFocusPath} />
      ) : null}
    </>
  );

  if (!desktop) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
        <p className="m-0 text-display" aria-hidden="true">
          {copy.title}
        </p>
        <FilesChips me={filesMe} at={at} />
        {main}
        {dialogs}
      </div>
    );
  }

  return (
    <GlassCard
      level={2}
      className="hl-window-fill mx-auto grid min-h-0 w-full max-w-window flex-1 grid-cols-[240px_1fr] overflow-hidden p-0"
    >
      <div className="flex min-h-0 flex-col border-r border-hairline px-3 pt-6 pb-5">
        <p className="m-0 mb-3 px-3 text-title-2 font-bold" aria-hidden="true">
          {copy.title}
        </p>
        <FilesSidebar
          me={filesMe}
          at={at}
          onConnect={() => setConnecting(true)}
          onDisconnect={setDisconnecting}
          onDropItems={canMove ? (entries, from, to, name) => mover.move(entries, from, to, name) : undefined}
        />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-col">{main}</div>
      {dialogs}
    </GlassCard>
  );
}
