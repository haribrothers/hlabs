// Recents (US-FILE-01): the 50 most recently changed files in this person's Home (and Shared when allowed), newest
// first. Each shows the folder it is in.
import type { FileEntry } from '@hlabs/api';
import { ScrollPane } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { filesCopy as copy } from '../copy/files';
import { useIsDesktop } from '../lib/use-media';
import { useTRPC } from '../lib/trpc';
import { FileGrid } from './file-grid';
import type { FilesMe } from './folder-view';

/** "Home › Documents" for `/home/Documents/a.pdf`; the tops of places by their names. */
export function folderLine(path: string): string {
  const parts = path.split('/').filter(Boolean).slice(0, -1);
  if (!parts.length) return '';
  const top = copy.areaNames[`/${parts[0]}`] ?? parts[0]!;
  return [top, ...parts.slice(1)].join(' › ');
}

export function RecentsView({
  me,
  onOpenFile,
}: {
  me: FilesMe;
  onOpenFile: (entry: FileEntry, items: FileEntry[]) => void;
}) {
  const trpc = useTRPC();
  const desktop = useIsDesktop();
  const recent = useQuery({ ...trpc.files.recent.queryOptions(), staleTime: 30_000, refetchInterval: 4 * 60_000 });
  const items = recent.data?.items ?? [];
  return (
    <ScrollPane
      className="min-h-0 flex-1"
      header={<h1 className="m-0 text-title-2">{copy.recents}</h1>}
      headerClassName="px-7 pt-6 pb-4 max-md:px-0 max-md:pt-0"
      scrollClassName="mr-2 max-md:mr-0"
      bodyClassName="flex min-h-full flex-col px-5 pb-5 max-md:px-0"
    >
      {recent.data && items.length === 0 ? (
        <p className="m-0 py-16 text-center text-body text-ink-muted">{copy.noRecents}</p>
      ) : (
        <FileGrid
          items={items}
          label={copy.recents}
          accent={me.accent}
          onOpen={(e) => onOpenFile(e, items)}
          openOnClick={!desktop}
          below={(e) => folderLine(e.path)}
        />
      )}
    </ScrollPane>
  );
}
