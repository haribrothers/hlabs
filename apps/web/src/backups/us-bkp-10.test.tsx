// US-BKP-10 · See the encryption password once: six words made when the dialog opens, Copy, the warning, sent with
// Add; later only after the admin's password.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { backupsHandlers, destination } from '../test/backups';
import { daemonError, renderScreen } from '../test/render';
import { AddDestinationDialog } from './add-destination-dialog';
import { EditDestinationDialog } from './edit-destination-dialog';

describe('US-BKP-10', () => {
  it('a six-word password with Copy and the warning; it’s the one Add sends', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const { calls } = renderScreen(
      () => <AddDestinationDialog onClose={() => {}} />,
      backupsHandlers({ 'backups.destinations.add': () => ({ destinationId: 'd9' }) }),
    );
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByRole('textbox', { name: 'Encryption password' }) as HTMLInputElement;
    expect(field.value).toMatch(/^[a-z]+(-[a-z]+){5}$/);
    expect(field).toHaveAttribute('readonly');
    expect(dialog).toHaveTextContent(
      "Save this password somewhere safe. Without it, these backups can't be restored, not even by the admin.",
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(field.value));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Endpoint' }), {
      target: { value: 'https://s3.example.com' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Access key' }), { target: { value: 'k' } });
    fireEvent.change(within(dialog).getByLabelText('Secret key'), { target: { value: 's' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add destination' }));
    await waitFor(() => expect(calls.some((c) => c.path === 'backups.destinations.add')).toBe(true));
    expect(
      (calls.find((c) => c.path === 'backups.destinations.add')!.input as { repoPassword: string }).repoPassword,
    ).toBe(field.value);
  });

  it('Show encryption password asks for the admin’s password; a wrong one says so, the right one shows it', async () => {
    renderScreen(
      () => <EditDestinationDialog destination={destination()} onClose={() => {}} />,
      backupsHandlers({
        'backups.exportRepoPassword': (input) => {
          if ((input as { password: string }).password !== 'right') throw daemonError('AUTH_INVALID_PASSWORD');
          return { repoPassword: 'maple-orbit-tundra-cobalt-ferry-quill' };
        },
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Show encryption password' }));
    const dialog = await screen.findByRole('dialog', { name: 'Show encryption password' });
    expect(dialog).toHaveTextContent('Enter your hlabs password to see the encryption password for NAS.');
    const field = within(dialog).getByLabelText('Your password');
    fireEvent.change(field, { target: { value: 'wrong' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show' }));
    expect(await within(dialog).findByText("That's not your password")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: 'right' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show' }));
    const shown = await screen.findByRole('dialog', { name: 'Encryption password for NAS' });
    expect(within(shown).getByRole('textbox', { name: 'Encryption password' })).toHaveValue(
      'maple-orbit-tundra-cobalt-ferry-quill',
    );
  });
});
