// US-INST-17 · Choose an account and a new password: the "Reset a password" window.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunningMenu } from '../src/menu';
import { ResetPassword } from '../src/reset-password';
import { answer, reset, tauri } from './tauri';

const users = [
  { id: 'u2', username: 'hari', displayName: 'Hari', role: 'admin', totpEnabled: false },
  { id: 'u3', username: 'asha', displayName: 'Asha', role: 'member', totpEnabled: true },
];

describe('US-INST-17 · Choose an account and a new password', () => {
  beforeEach(() => {
    reset();
    answer({ users });
  });

  it('"Reset a password…" in the menu opens its window', async () => {
    render(<RunningMenu status={null} />);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reset a password…' }));
    expect(tauri.invoke).toHaveBeenCalledWith('open_reset_window');
  });

  it('is titled "Reset a password" with the note, and lists accounts as "<Name> (@user) · Admin"', async () => {
    render(<ResetPassword />);
    expect(screen.getByRole('form', { name: 'Reset a password' })).toHaveTextContent(
      'Only people who can log in to this Mac can do this.',
    );
    const account = screen.getByRole('combobox', { name: 'Account' });
    expect(await screen.findByRole('option', { name: 'Hari (@hari) · Admin' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Asha (@asha) · Member' })).toBeInTheDocument();
    expect(account).toHaveValue('hari');
  });

  it('checks the password as you type and enables "Reset password" only when it is allowed', async () => {
    render(<ResetPassword />);
    await screen.findByRole('option', { name: 'Hari (@hari) · Admin' });
    const submit = screen.getByRole('button', { name: 'Reset password' });
    expect(submit).toBeDisabled();
    const field = screen.getByLabelText('New password');
    await userEvent.type(field, 'short');
    expect(screen.getByText('Use at least 12 characters')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await userEvent.clear(field);
    await userEvent.type(field, 'password1234');
    expect(screen.getByText('This password is too common')).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.type(field, 'violet harbour lantern');
    expect(submit).toBeEnabled();
  });

  it('offers "Also turn off two-factor" only for an account with two-factor, unchecked', async () => {
    render(<ResetPassword />);
    await screen.findByRole('option', { name: 'Hari (@hari) · Admin' });
    expect(
      screen.queryByRole('checkbox', { name: 'Also turn off two-factor for this account' }),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'asha');
    expect(screen.getByRole('checkbox', { name: 'Also turn off two-factor for this account' })).not.toBeChecked();
  });

  it('says macOS asks next, above Cancel and Reset password', async () => {
    const onCancel = vi.fn();
    render(<ResetPassword onCancel={onCancel} />);
    expect(screen.getByText("Next, macOS asks for this Mac's login password to confirm it's you.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('can show the password', async () => {
    render(<ResetPassword />);
    const field = screen.getByLabelText('New password');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
  });
});
