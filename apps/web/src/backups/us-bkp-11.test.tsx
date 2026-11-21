// US-BKP-11 · Edit or remove a destination: rename and new keys (tested before saving), the place fixed; removing
// says nothing at the destination is deleted and waits for a backup to it.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { backupsHandlers, destination } from '../test/backups';
import { daemonError, renderScreen } from '../test/render';
import { EditDestinationDialog } from './edit-destination-dialog';

describe('US-BKP-11', () => {
  it('cloud storage: rename and new keys; a failed test keeps the dialog open with the reason', async () => {
    let fail = true;
    const onClose = vi.fn();
    const { calls } = renderScreen(
      () => (
        <EditDestinationDialog
          destination={destination({ kind: 's3', name: 'Backblaze', hasKeys: true, location: 's3.example.com/b' })}
          onClose={onClose}
        />
      ),
      backupsHandlers({
        'backups.destinations.update': () => {
          if (fail) throw daemonError('BACKUP_DEST_AUTH_FAILED');
          return { ok: true };
        },
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit Backblaze' });
    expect(dialog).toHaveTextContent("Cloud storage · s3.example.com/bThe type and place can't change.");
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'B2' } });
    fireEvent.change(within(dialog).getByLabelText('Secret key'), { target: { value: 'new' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Access key or secret key is wrong');
    expect(onClose).not.toHaveBeenCalled();
    fail = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter((c) => c.path === 'backups.destinations.update').at(-1)!.input).toEqual({
      destinationId: 'd1',
      name: 'B2',
      secretKey: 'new',
    });
  });

  it('a network drive has no keys to change', async () => {
    renderScreen(() => <EditDestinationDialog destination={destination()} onClose={() => {}} />, backupsHandlers());
    const dialog = await screen.findByRole('dialog', { name: 'Edit NAS' });
    expect(within(dialog).queryByLabelText('Secret key')).toBeNull();
  });

  it('Remove: “Stop backing up to NAS?”, backups stay; off while a backup to it runs', async () => {
    const onClose = vi.fn();
    const { calls } = renderScreen(
      () => <EditDestinationDialog destination={destination()} onClose={onClose} />,
      backupsHandlers({ 'backups.destinations.remove': () => ({ ok: true }) }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remove destination' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Stop backing up to NAS?' });
    expect(confirm).toHaveTextContent('Existing backups stay on the NAS and can be added again later.');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.some((c) => c.path === 'backups.destinations.remove')).toBe(true);
  });

  it('a backup to it running: Remove is off and says why', async () => {
    renderScreen(
      () => <EditDestinationDialog destination={destination({ busy: true })} onClose={() => {}} />,
      backupsHandlers(),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remove destination' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(confirm).toHaveTextContent('A backup to it is running.');
  });
});
