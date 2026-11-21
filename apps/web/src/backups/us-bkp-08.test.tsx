// US-BKP-08 · Choose a destination type and fill in its details: three types (Another hlabs waits, D-132), the
// fields each needs, https only, and nothing to test or add until they're filled.
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { backupsHandlers } from '../test/backups';
import { renderScreen } from '../test/render';
import { AddDestinationDialog, cloudName } from './add-destination-dialog';

const open = (over: Record<string, (i: unknown) => unknown> = {}) =>
  renderScreen(() => <AddDestinationDialog onClose={() => {}} />, backupsHandlers(over));

describe('US-BKP-08', () => {
  it('“Add a backup destination” offers Cloud storage, Network drive and External drive', async () => {
    open();
    const dialog = await screen.findByRole('dialog', { name: 'Add a backup destination' });
    const types = within(dialog).getByRole('radiogroup', { name: 'Destination type' });
    expect(
      within(types)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual([
      'Cloud storageS3-compatible, e.g. Backblaze B2',
      'Network driveSMB or NFS share',
      'External driveUSB or Thunderbolt',
    ]);
  });

  it('cloud storage: Endpoint (https only), Bucket, Access key, Secret key; buttons wait until all are filled', async () => {
    open();
    const dialog = await screen.findByRole('dialog');
    const test = within(dialog).getByRole('button', { name: 'Test connection' });
    const add = within(dialog).getByRole('button', { name: 'Add destination' });
    expect(test).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Endpoint' }), {
      target: { value: 'http://s3.example.com' },
    });
    expect(within(dialog).getByText('Use an https:// address')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Endpoint' }), {
      target: { value: 'https://s3.eu-central-003.backblazeb2.com' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Access key' }), { target: { value: 'key' } });
    expect(add).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Secret key'), { target: { value: 'secret' } });
    expect(test).toBeEnabled();
    expect(add).toBeEnabled();
    expect(cloudName('https://s3.eu-central-003.backblazeb2.com')).toBe('Backblaze B2');
  });

  it('network drive: a connected one, or a share address with a username and password for SMB', async () => {
    open({
      'storage.locations.list': () => ({
        locations: [
          {
            id: 'root',
            kind: 'local',
            name: 'This computer',
            path: '/x',
            isRoot: true,
            status: 'ok',
            autoMount: true,
            appsAllowed: true,
            usedBy: [],
            readOnly: false,
          },
          {
            id: 'nas',
            kind: 'smb',
            name: 'NAS · Backups',
            path: '/m',
            isRoot: false,
            status: 'ok',
            autoMount: true,
            appsAllowed: false,
            usedBy: [],
            readOnly: false,
          },
        ],
      }),
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /Network drive/ }));
    const drives = await within(dialog).findByRole('radiogroup', { name: 'Choose a connected drive' });
    fireEvent.click(within(drives).getByRole('radio', { name: /NAS · Backups/ }));
    expect(within(dialog).getByRole('button', { name: 'Add destination' })).toBeEnabled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Or enter a share address' }), {
      target: { value: 'smb://office.local/Backups' },
    });
    expect(within(drives).getByRole('radio', { name: /NAS · Backups/ })).toHaveAttribute('aria-checked', 'false');
    expect(within(dialog).getByRole('textbox', { name: 'Username' })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Or enter a share address' }), {
      target: { value: 'nope' },
    });
    expect(within(dialog).getByText('Use smb://host/share or nfs://host/path')).toBeInTheDocument();
  });

  it('external drive: a connected drive and a folder name, hlabs-backups at first', async () => {
    open({
      'storage.listDrives': () => ({
        drives: [{ path: '/Volumes/T7', name: 'Samsung T7', freeBytes: 820e9, fsType: 'exfat', writable: true }],
      }),
    });
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /External drive/ }));
    fireEvent.click(await within(dialog).findByRole('radio', { name: /Samsung T7/ }));
    expect(within(dialog).getByText('820 GB free')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Folder name' })).toHaveValue('hlabs-backups');
    expect(within(dialog).getByRole('button', { name: 'Add destination' })).toBeEnabled();
  });
});
