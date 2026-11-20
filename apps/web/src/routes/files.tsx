import { isFeatureEnabled } from '@hlabs/shared';
import { createFileRoute } from '@tanstack/react-router';
import { areaLabels } from '../copy/shell';
import { FilesScreen } from '../files/files-page';
import { AreaWindow } from '../shell/area-window';

export interface FilesSearch {
  /** The open folder, a virtual path (US-FILE-02): `/files?path=/home/Documents`. */
  path?: string;
  /** Recents instead of a folder (US-FILE-01). */
  view?: 'recents' | 'trash';
}

export const Route = createFileRoute('/files')({
  validateSearch: (search: Record<string, unknown>): FilesSearch => ({
    path: typeof search.path === 'string' && search.path.startsWith('/') ? search.path : undefined,
    view: search.view === 'recents' || search.view === 'trash' ? search.view : undefined,
  }),
  // Files ships in phase 5 (D-036); until then the area's placeholder.
  component: () => (isFeatureEnabled('files') ? <FilesScreen /> : <AreaWindow title={areaLabels.files} />),
});
