// US-BKP-09 · Test the connection and add the destination: "Connected" or the reason in the dialog, backups already
// there ask for their password, Add saves it with "Destination added".
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { backupsHandlers } from '../test/backups';
import { daemonError, renderScreen } from '../test/render';
import { AddDestinationDialog } from './add-destination-dialog';

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

function fillCloud(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Endpoint' }), {
    target: { value: 'https://s3.example.com' },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Access key' }), { target: { value: 'key' } });
  fireEvent.change(within(dialog).getByLabelText('Secret key'), { target: { value: 'secret' } });
}

describe('US-BKP-09', () => {
  it('Test connection: “Connected”, or the reason inline (wrong keys under the secret key)', async () => {
    let fail = false;
    renderScreen(
      () => <AddDestinationDialog onClose={() => {}} />,
      backupsHandlers({
        'backups.destinations.test': () => {
          if (fail) throw daemonError('BACKUP_DEST_AUTH_FAILED');
          return { existing: false };
        },
      }),
    );
    const dialog = await screen.findByRole('dialog');
    fillCloud(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test connection' }));
    expect(await within(dialog).findByText('Connected')).toBeInTheDocument();
    fail = true;
    fireEvent.change(within(dialog).getByLabelText('Secret key'), { target: { value: 'other' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test connection' }));
    expect(await within(dialog).findByText('Access key or secret key is wrong')).toBeInTheDocument();
    expect(within(dialog).queryByText('Connected')).toBeNull();
  });

  it('backups already there: “Enter their encryption password”, a wrong one says so', async () => {
    const tries: string[] = [];
    renderScreen(
      () => <AddDestinationDialog onClose={() => {}} />,
      backupsHandlers({
        'backups.destinations.test': (input) => {
          tries.push((input as { repoPassword: string }).repoPassword);
          throw daemonError('BACKUP_REPO_PASSWORD_WRONG', { existing: true });
        },
      }),
    );
    const dialog = await screen.findByRole('dialog');
    fillCloud(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test connection' }));
    expect(
      await within(dialog).findByText('Backups already exist here. Enter their encryption password to use them.'),
    ).toBeInTheDocument();
    const field = within(dialog).getByLabelText('Encryption password');
    expect(field).toHaveValue('');
    expect(within(dialog).queryByText(/Save this password somewhere safe/)).toBeNull();
    fireEvent.change(field, { target: { value: 'their-old-password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test connection' }));
    expect(await within(dialog).findByText("That password doesn't open these backups")).toBeInTheDocument();
    expect(tries.at(-1)).toBe('their-old-password');
  });

  it('Add destination saves it, says “Destination added” and closes', async () => {
    const onClose = vi.fn();
    const { calls } = renderScreen(
      () => <AddDestinationDialog onClose={onClose} />,
      backupsHandlers({ 'backups.destinations.add': () => ({ destinationId: 'd9' }) }),
    );
    const dialog = await screen.findByRole('dialog');
    fillCloud(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add destination' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.path === 'backups.destinations.add')!.input).toMatchObject({
      name: 's3.example.com',
      target: {
        type: 'cloud',
        endpoint: 'https://s3.example.com',
        bucket: 'hlabs-backups',
        accessKey: 'key',
        secretKey: 'secret',
      },
    });
    expect(currentToasts().map((t) => t.title)).toContain('Destination added');
  });

  it('the storage disk is refused with what to do', async () => {
    renderScreen(
      () => <AddDestinationDialog onClose={() => {}} />,
      backupsHandlers({
        'backups.destinations.test': () => {
          throw daemonError('VALIDATION_FAILED', { reason: 'sameDisk' });
        },
      }),
    );
    const dialog = await screen.findByRole('dialog');
    fillCloud(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Test connection' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Pick a different disk than the one hlabs stores data on',
    );
  });
});
