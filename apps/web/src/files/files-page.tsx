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
import { FilesChips, FilesSidebar } from './sidebar';
import { FolderToolbar } from './toolbar';

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
  const me = useMe().data;
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const [, setConnecting] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ entry: FileEntry; items: FileEntry[] } | null>(null);
  // The search belongs to the folder it was typed in: opening another one clears it.
  const [search, setSearch] = useState({ path: at.path, text: '' });
  const searchText = search.path === at.path ? search.text : '';
  const searchQuery = useDebouncedQuery(searchText);
  const uploads = useFileUploads();
  const folderPath = at.path || HOME;

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

  if (!me) return null;
  const filesMe: FilesMe = {
    role: me.role,
    displayName: me.displayName,
    canSeeShared: me.canSeeShared,
    accent: me.appearance.accent,
  };
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
        search={
          <SearchField
            value={searchText}
            onChange={(text) => setSearch({ path: at.path, text })}
            place={placeName(at.path)}
          />
        }
        toolbar={(place, folderName) => (
          <FolderToolbar
            readOnly={place.readOnly}
            onNewFolder={() => setNewFolder(true)}
            onUpload={() => uploads.choose(folderPath, folderName)}
          />
        )}
        onDropFiles={(data, folderName) => uploads.drop(data, folderPath, folderName)}
        notice={(folderName) => uploads.notice(folderPath, folderName)}
      />
    );
  const dialogs = (
    <>
      {uploads.ui}
      {preview ? (
        <FilePreview
          entry={preview.entry}
          items={preview.items}
          onNavigate={(entry) => setPreview({ ...preview, entry })}
          onClose={() => setPreview(null)}
          openWith={<OpenWith path={preview.entry.path} />}
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
        <FilesSidebar me={filesMe} at={at} onConnect={() => setConnecting(true)} />
      </div>
      <div className="relative flex min-h-0 min-w-0 flex-col">{main}</div>
      {dialogs}
    </GlassCard>
  );
}
