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
import { FilesChips, FilesSidebar } from './sidebar';

export interface FilesPageProps {
  at: FilesLocation;
}

/** Where Files is, from `/files?path=…` or `/files?view=recents` (US-FILE-02: back and forward move between folders). */
export function locationOf(search: Record<string, unknown>): FilesLocation {
  if (search.view === 'recents') return { path: '', view: 'recents' };
  const path = typeof search.path === 'string' && search.path.startsWith('/') ? search.path : HOME;
  return { path, view: 'folder' };
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
  const onOpenFile = (_entry: FileEntry, _items: FileEntry[]) => {};

  const main: ReactNode =
    at.view === 'recents' ? (
      <RecentsView me={filesMe} onOpenFile={onOpenFile} />
    ) : (
      <FolderView path={at.path || HOME} me={filesMe} onOpenFile={onOpenFile} />
    );

  if (!desktop) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
        <p className="m-0 text-display" aria-hidden="true">
          {copy.title}
        </p>
        <FilesChips me={filesMe} at={at} />
        {main}
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
      <div className="flex min-h-0 min-w-0 flex-col">{main}</div>
    </GlassCard>
  );
}
