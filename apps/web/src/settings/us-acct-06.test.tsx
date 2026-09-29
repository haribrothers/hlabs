import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderScreen } from '../test/render';
import { Security } from './security';

const account = (passwordChangedAt: number | null) => () => ({
  id: 'u1',
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: 'violet',
  locale: 'en',
  passwordChangedAt,
  totpEnabledAt: null,
  recoveryCodesUnused: 0,
  homeFolderBytes: null,
  adminName: 'Hari',
});

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

async function open(changedAt: number | null = null, handlers = {}) {
  renderScreen(Security, {
    'account.get': account(changedAt),
    'auth.listSessions': () => ({ items: [] }),
    ...handlers,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
  return screen.findByRole('dialog', { name: 'Change password' });
}

describe('US-ACCT-06', () => {
  it('Password reads "Changed when you set up hlabs", or how long ago it changed', async () => {
    const { unmount } = renderScreen(Security, { 'account.get': account(null) });
    expect(await screen.findByText('Changed when you set up hlabs')).toBeInTheDocument();
    unmount();
    renderScreen(Security, { 'account.get': account(Date.now() - 3 * 86_400_000) });
    expect(await screen.findByText('Changed 3 days ago')).toBeInTheDocument();
  });

  it('the dialog has the three fields, a checked and disabled "Sign out my other devices", Cancel and Change password', async () => {
    const dialog = await open();
    for (const label of ['Current password', 'New password', 'Confirm new password']) {
      expect(within(dialog).getByLabelText(label)).toHaveAttribute('type', 'password');
    }
    const box = within(dialog).getByRole('checkbox', { name: 'Sign out my other devices' });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Change password' })).toBeDisabled();
  });

  it('the hint says whether the new password is long enough', async () => {
    const dialog = await open();
    const next = within(dialog).getByLabelText('New password');
    fireEvent.change(next, { target: { value: 'short one' } });
    expect(next).toHaveAccessibleDescription('Too short · at least 12 characters');
    fireEvent.change(next, { target: { value: 'a much longer passphrase' } });
    expect(next).toHaveAccessibleDescription('Strong · at least 12 characters');
  });

  it('Enter in the last field changes it: the dialog closes and says the other devices are signed out', async () => {
    const change = vi.fn(() => ({ ok: true }));
    const dialog = await open(null, { 'account.changePassword': change });
    fireEvent.change(within(dialog).getByLabelText('Current password'), { target: { value: 'correct horse battery' } });
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'a much longer passphrase' } });
    const confirm = within(dialog).getByLabelText('Confirm new password');
    fireEvent.change(confirm, { target: { value: 'a much longer passphrase' } });
    fireEvent.submit(confirm.closest('form')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(change).toHaveBeenCalledWith({
      currentPassword: 'correct horse battery',
      newPassword: 'a much longer passphrase',
    });
    expect(currentToasts().map((t) => t.title)).toEqual(['Password changed. Your other devices are signed out.']);
  });

  it('Cancel closes without changes', async () => {
    const change = vi.fn();
    const dialog = await open(null, { 'account.changePassword': change });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(change).not.toHaveBeenCalled();
  });
});
