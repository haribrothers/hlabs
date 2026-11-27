// US-APP-17 · Folder access: the Permissions tab says apps only see what you allow; each folder shows its place as a
// breadcrumb, its mode and the manifest's label; "+ Give access to a folder" opens the folder picker from Files, then
// Read only or Read and write, and adds it at /mnt/hlabs/<folder-name>; a required folder can't be removed; an
// offline drive says "Not connected"; Devices lists what the app asked for, read only.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { appConfig, renderPermissions } from '../test/app-config';
import { filesHandlers } from '../test/files';
import { fakeMe } from '../test/me';
import { daemonError } from '../test/render';

const documents = {
  target: 'attachments',
  storageLocationId: 'root',
  subpath: 'users/hari/Documents',
  mode: 'ro' as const,
  place: { area: 'home' as const, locationName: null, path: 'Documents' },
  filesPath: '/home/Documents',
  available: true,
  folder: {
    key: 'attachments',
    label: 'Attachments',
    description: 'For importing attachments',
    required: false,
    mode: 'rw' as const,
  },
};
const backups = {
  target: '/mnt/hlabs/Backups',
  storageLocationId: 'nas',
  subpath: 'Backups',
  mode: 'rw' as const,
  place: { area: 'location' as const, locationName: 'NAS', path: 'Backups' },
  filesPath: '/drives/nas/Backups',
  available: true,
  folder: null,
};

const entry = (path: string) => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  kind: 'folder',
  size: null,
  childCount: 0,
  modifiedAt: 1,
  mime: null,
  previewUrl: null,
});

const picker = filesHandlers({
  'auth.me': fakeMe({ role: 'admin' }),
  'storage.locations.list': () => ({ locations: [] }),
  'files.list': (input) => {
    const i = input as { path: string };
    if (i.path !== '/home') throw daemonError('NOT_FOUND');
    return {
      path: '/home',
      crumbs: [{ path: '/home', name: null }],
      place: { area: 'home', name: 'Hari', readOnly: false },
      location: { id: 'root', subpath: 'users/hari' },
      items: [entry('/home/Documents'), entry('/home/Photos')],
      nextCursor: null,
      count: 2,
      filesBytes: 0,
    };
  },
});

describe('US-APP-17', () => {
  it('says apps only see what you allow, and lists each folder with its place, mode and label', async () => {
    renderPermissions({}, appConfig({ folders: [documents, backups] }));
    expect(
      await screen.findByText('Apps only see what you allow here. Changes take effect after a restart.'),
    ).toBeInTheDocument();
    const folders = screen.getByRole('group', { name: 'Folders' });
    expect(within(folders).getByText('Home › Documents')).toBeInTheDocument();
    expect(within(folders).getByText('Read only · for importing attachments')).toBeInTheDocument();
    expect(within(folders).getByText('NAS › Backups')).toBeInTheDocument();
    expect(within(folders).getByText('Read and write')).toBeInTheDocument();
  });

  it('a required folder can be changed but not removed', async () => {
    renderPermissions({}, appConfig({ folders: [{ ...documents, folder: { ...documents.folder, required: true } }] }));
    const folders = await screen.findByRole('group', { name: 'Folders' });
    expect(within(folders).getByRole('switch', { name: 'Access to Home › Documents' })).toBeDisabled();
    expect(within(folders).getByRole('button', { name: 'Change Home › Documents' })).toBeEnabled();
  });

  it('an offline network drive says "Not connected"', async () => {
    renderPermissions({}, appConfig({ folders: [{ ...backups, available: false }] }));
    const folders = await screen.findByRole('group', { name: 'Folders' });
    expect(within(folders).getByText('Not connected')).toBeInTheDocument();
  });

  it('"+ Give access to a folder" opens the picker, asks the mode, and adds it at /mnt/hlabs/<name>', async () => {
    const { calls } = renderPermissions({ ...picker, 'apps.setPermissions': () => ({ jobId: 'j1' }) });
    fireEvent.click(await screen.findByRole('button', { name: '+ Give access to a folder' }));
    const dialog = await screen.findByRole('dialog', { name: /Choose a folder for Vaultwarden/ });
    fireEvent.click(await within(dialog).findByRole('option', { name: 'Documents' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use Documents' }));
    const mode = await screen.findByRole('dialog', { name: 'Folder access' });
    fireEvent.click(within(mode).getByRole('radio', { name: 'Read only' }));
    fireEvent.click(within(mode).getByRole('button', { name: 'Give access' }));
    const folders = screen.getByRole('group', { name: 'Folders' });
    expect(await within(folders).findByText('Home › Documents')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save and restart app' }));
    await waitFor(() => expect(calls.find((c) => c.path === 'apps.setPermissions')).toBeDefined());
    expect(calls.find((c) => c.path === 'apps.setPermissions')!.input).toEqual({
      appId: 'vaultwarden',
      mounts: [
        { target: '/mnt/hlabs/Documents', storageLocationId: 'root', subpath: 'users/hari/Documents', mode: 'ro' },
      ],
      network: { internet: true, apps: true },
    });
  });

  it('turning a folder off takes it away on save', async () => {
    const { calls } = renderPermissions(
      { 'apps.setPermissions': () => ({ jobId: 'j1' }) },
      appConfig({ folders: [documents, backups] }),
    );
    fireEvent.click(await screen.findByRole('switch', { name: 'Access to NAS › Backups' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and restart app' }));
    await waitFor(() => expect(calls.find((c) => c.path === 'apps.setPermissions')).toBeDefined());
    expect((calls.find((c) => c.path === 'apps.setPermissions')!.input as { mounts: unknown[] }).mounts).toEqual([
      { target: 'attachments', storageLocationId: 'root', subpath: 'users/hari/Documents', mode: 'ro' },
    ]);
  });

  it("Devices says when the app hasn't asked for any", async () => {
    renderPermissions();
    const devices = await screen.findByRole('group', { name: 'Devices' });
    expect(within(devices).getByText("This app hasn't asked for USB, GPU or other device access.")).toBeInTheDocument();
  });

  it('Devices lists the ones it asked for, read only', async () => {
    renderPermissions(
      {},
      appConfig({
        devices: { gpu: false, list: [{ path: '/dev/ttyUSB0', label: 'Zigbee USB adapter' }], capabilities: [] },
      }),
    );
    const devices = await screen.findByRole('group', { name: 'Devices' });
    expect(within(devices).getByText('Zigbee USB adapter')).toBeInTheDocument();
    expect(within(devices).getByText('/dev/ttyUSB0')).toBeInTheDocument();
    expect(within(devices).queryByRole('switch')).toBeNull();
    expect(within(devices).queryByRole('button')).toBeNull();
  });
});
