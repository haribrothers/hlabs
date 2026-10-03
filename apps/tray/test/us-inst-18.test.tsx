// US-INST-18 · Confirm with the OS and apply the reset: the window's side. The Rust side asks macOS (LocalAuthentication)
// before any call, resets, notifies and closes the window; tested here with its outcomes.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPassword, ResetPasswordWindow } from '../src/reset-password';
import { answer, reset, tauri } from './tauri';

const users = [
  { id: 'u2', username: 'hari', displayName: 'Hari', role: 'admin', totpEnabled: false },
  { id: 'u3', username: 'asha', displayName: 'Asha', role: 'member', totpEnabled: true },
];
const PASSWORD = 'violet harbour lantern';

async function fill() {
  await screen.findByRole('option', { name: 'Hari (@hari) · Admin' });
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Account' }), 'asha');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Also turn off two-factor for this account' }));
  await userEvent.type(screen.getByLabelText('New password'), PASSWORD);
}

describe('US-INST-18 · Confirm with the OS and apply the reset', () => {
  beforeEach(() => {
    reset();
    answer({ users });
  });

  it('"Reset password" hands the account, password and two-factor choice to the Rust side', async () => {
    render(<ResetPasswordWindow />);
    await fill();
    tauri.invoke.mockImplementationOnce(async () => null);
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(tauri.invoke).toHaveBeenCalledWith('reset_password', {
      username: 'asha',
      newPassword: PASSWORD,
      disableTotp: true,
    });
  });

  it('cancelling the macOS prompt changes nothing and keeps what was typed', async () => {
    const onSubmit = vi.fn().mockRejectedValue({ kind: 'cancelled' });
    render(<ResetPassword onSubmit={onSubmit} />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue(PASSWORD);
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveValue('asha');
  });

  it('an account removed meanwhile says "This account no longer exists" and refreshes the list', async () => {
    const onSubmit = vi.fn().mockRejectedValue({ kind: 'notFound' });
    render(<ResetPassword onSubmit={onSubmit} />);
    await fill();
    answer({ users: [users[0]] });
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This account no longer exists.');
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Asha (@asha) · Member' })).not.toBeInTheDocument(),
    );
  });

  it('any other failure says what to do', async () => {
    const onSubmit = vi.fn().mockRejectedValue({ kind: 'failed' });
    render(<ResetPassword onSubmit={onSubmit} />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("The password wasn't reset.");
  });
});
