// US-FILE-07 · Open a file with an app: "Open with" in the preview lists the apps (logo and name) that can open the
// file and opens one in a new tab; without any it isn't there.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { filesHandlers, folder } from '../test/files';
import { renderScreen } from '../test/render';
import { FilesScreen } from './files-page';

const photo = {
  name: 'beach.jpg',
  path: '/home/Photos/beach.jpg',
  kind: 'file',
  size: 1000,
  childCount: null,
  modifiedAt: 1,
  mime: 'image/jpeg',
  previewUrl: null,
};
const app = (id: string, name: string) => ({
  id,
  name,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});

function open(apps: unknown[]) {
  renderScreen(
    FilesScreen,
    filesHandlers({
      'files.list': () => folder('/home/Photos', { items: [photo], count: 1 }),
      'files.preview': () => ({ url: '/api/files/preview/t', expiresAt: 1 }),
      'files.stat': () => ({ ...photo, dimensions: null, parent: [{ path: '/home', name: null }], readOnly: false }),
      'files.openWith': () => ({ apps }),
    }),
    { path: '/files', entries: ['/files?path=%2Fhome%2FPhotos'] },
  );
}

describe('US-FILE-07', () => {
  it('lists the apps that can open the file; each opens in a new tab', async () => {
    open([app('immich', 'Immich'), app('nextcloud', 'Nextcloud')]);
    fireEvent.click(await screen.findByRole('button', { name: /^beach\.jpg/ }));
    const dialog = await screen.findByRole('dialog');
    const section = await within(dialog).findByRole('region', { name: 'Open with' });
    const links = within(section).getAllByRole('link');
    expect(links.map((l) => [l.getAttribute('aria-label'), l.getAttribute('href')])).toEqual([
      ['Open in Immich', 'https://immich.hlabs.local'],
      ['Open in Nextcloud', 'https://nextcloud.hlabs.local'],
    ]);
    expect(links[0]).toHaveTextContent(/Immich$/);
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('no app uses the folder: no Open with', async () => {
    open([]);
    fireEvent.click(await screen.findByRole('button', { name: /^beach\.jpg/ }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByRole('region', { name: 'Details' });
    expect(within(dialog).queryByText('Open with')).toBeNull();
  });
});
