// US-FILE-12 · Disconnect or recover a network drive: a drive that can't be reached says so with Try again (which
// mounts it again); right-clicking a drive offers Disconnect; the dialog says files stay, or names the app using it.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filesHandlers, folder } from '../test/files';
import { daemonError, renderScreen } from '../test/render';
import { FilesScreen } from './files-page';

const drives = (usedBy: string[]) => () => ({
  locations: [
    { id: 'root', kind: 'local', name: 'This computer', path: '/x', isRoot: true, status: 'ok', usedBy: [] },
    { id: 'nas', kind: 'smb', name: 'NAS · Media', path: '/m', isRoot: false, status: 'unreachable', usedBy },
  ],
});

describe('US-FILE-12', () => {
  it('"Can\'t reach <drive>" with Try again, which mounts it again', async () => {
    let online = false;
    const { calls } = renderScreen(
      FilesScreen,
      filesHandlers({
        'files.list': () => {
          if (!online) throw daemonError('NAS_UNREACHABLE', { reason: 'unreachable', location: 'NAS · Media' });
          return folder('/drives/nas', {
            crumbs: [{ path: '/drives/nas', name: 'NAS · Media' }],
            place: { area: 'drive', name: 'NAS · Media', readOnly: false },
          });
        },
        'storage.locations.reconnect': () => {
          online = true;
          return { status: 'ok' };
        },
      }),
      { path: '/files', entries: ['/files?path=%2Fdrives%2Fnas'] },
    );
    expect(await screen.findByText("Can't reach NAS · Media")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'NAS · Media' })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === 'storage.locations.reconnect').map((c) => c.input)).toEqual([
      { locationId: 'nas' },
    ]);
  });

  it('right-click a drive: Disconnect, "Files on the drive are not deleted."', async () => {
    const { calls } = renderScreen(
      FilesScreen,
      filesHandlers({ 'storage.locations.list': drives([]), 'storage.locations.remove': () => ({ ok: true }) }),
      { path: '/files' },
    );
    const row = await screen.findByRole('link', { name: /NAS · Media/ });
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disconnect NAS · Media?' });
    expect(dialog).toHaveTextContent('Files on the drive are not deleted.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls.filter((c) => c.path === 'storage.locations.remove').map((c) => c.input)).toEqual([
      { locationId: 'nas' },
    ]);
  });

  it('an app keeping folders on it is named, and there is no Disconnect', async () => {
    renderScreen(FilesScreen, filesHandlers({ 'storage.locations.list': drives(['Jellyfin']) }), { path: '/files' });
    fireEvent.contextMenu(await screen.findByRole('link', { name: /NAS · Media/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disconnect NAS · Media?' });
    expect(dialog).toHaveTextContent('Jellyfin uses this drive. Choose another folder for it first.');
    expect(within(dialog).queryByRole('button', { name: 'Disconnect' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
