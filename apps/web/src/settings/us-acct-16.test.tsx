import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { keptHomeFolderName } from '@hlabs/shared';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { DeleteUserDialog } from './delete-user-dialog';

const anu = {
  id: 'u2',
  username: 'anu',
  displayName: 'Anu',
  role: 'member' as const,
  avatarColor: null,
  totpEnabled: false,
  lastActiveAt: null,
  disabled: false,
  appCount: 1,
};

function open(remove: (input: unknown) => unknown = () => ({ jobId: null })) {
  const onClose = vi.fn();
  const r = renderScreen(() => <DeleteUserDialog user={anu} onClose={onClose} />, {
    'users.get': () => ({
      ...anu,
      appIds: [],
      canSeeShared: false,
      canSeeUsage: false,
      homeFolderBytes: 4_200_000_000,
    }),
    'users.delete': remove,
    'users.list': () => ({ users: [] }),
  });
  return { ...r, onClose };
}

describe('US-ACCT-16', () => {
  it('names the person, offers the Home folder (with its size) unchecked, and a destructive "Delete Anu"', async () => {
    open();
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Anu?' });
    const box = await within(dialog).findByRole('checkbox', { name: 'Also delete their Home folder (4.2 GB)' });
    expect(box).not.toBeChecked();
    expect(
      within(dialog).getByText(
        `Their Home folder is kept as users/${keptHomeFolderName('anu', Date.now())}, where admins can see it in Files.`,
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete Anu' })).toHaveClass('hl-btn-destructive');
  });

  it('deletes with or without the Home folder, as chosen', async () => {
    const { calls, onClose } = open();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Also delete their Home folder/ }));
    expect(screen.getByText('Their Home folder goes to the trash and is emptied after 30 days.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Anu' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.path === 'users.delete')?.input).toEqual({ userId: 'u2', deleteHomeFolder: true });
  });

  it('the last admin is refused with "hlabs needs at least one admin."', async () => {
    const { onClose } = open(() => {
      throw daemonError('LAST_ADMIN');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Anu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('hlabs needs at least one admin.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
