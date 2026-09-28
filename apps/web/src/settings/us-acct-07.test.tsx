import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { ChangePassword } from './change-password';

const NEW = 'a much longer passphrase';

async function open(error?: ReturnType<typeof daemonError>) {
  renderScreen(() => <ChangePassword onClose={() => {}} />, {
    'account.changePassword': () => (error ? Promise.reject(error) : { ok: true }),
  });
  const dialog = await screen.findByRole('dialog');
  const get = (label: string) => within(dialog).getByLabelText(label, { exact: true });
  const fill = (current: string, next: string, confirm = next) => {
    fireEvent.change(get('Current password'), { target: { value: current } });
    fireEvent.change(get('New password'), { target: { value: next } });
    fireEvent.change(get('Confirm new password'), { target: { value: confirm } });
  };
  const submit = () => fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
  return { dialog, get, fill, submit };
}

describe('US-ACCT-07', () => {
  it('a wrong current password shows on that field; nothing is cleared', async () => {
    const { get, fill, submit } = await open(daemonError('AUTH_INVALID_PASSWORD'));
    fill('not it', NEW);
    submit();
    expect(await screen.findByText("That's not your current password")).toBeInTheDocument();
    expect(get('Current password')).toHaveAccessibleDescription("That's not your current password");
    expect(get('Current password')).toHaveValue('not it');
    expect(get('New password')).toHaveValue(NEW);
    expect(get('Confirm new password')).toHaveValue(NEW);
  });

  it('a common password is flagged on New password', async () => {
    const { get, fill } = await open();
    fill('current one', 'q1w2e3r4t5y6');
    expect(get('New password')).toHaveAccessibleDescription('This password is too common. Try a longer phrase.');
  });

  it('the same password as now shows "Choose a password you haven\'t used here"', async () => {
    const { get, fill, submit } = await open(daemonError('PASSWORD_UNCHANGED'));
    fill(NEW, NEW);
    submit();
    expect(await screen.findByText("Choose a password you haven't used here")).toBeInTheDocument();
    expect(get('New password')).toHaveAccessibleDescription("Choose a password you haven't used here");
  });

  it("confirm that doesn't match says so once the field is left, and Change stays disabled", async () => {
    const { dialog, get, fill } = await open();
    fill('current one', NEW, 'something else entirely');
    expect(within(dialog).queryByText("Passwords don't match")).toBeNull();
    fireEvent.blur(get('Confirm new password'));
    expect(get('Confirm new password')).toHaveAccessibleDescription("Passwords don't match");
    expect(within(dialog).getByRole('button', { name: 'Change password' })).toBeDisabled();
  });

  it('too many wrong current passwords: "Too many attempts. Try again in <n> minutes."', async () => {
    const { fill, submit } = await open(daemonError('AUTH_LOCKED', { retryAfterSeconds: 14 * 60 + 5 }));
    fill('not it', NEW);
    submit();
    expect(await screen.findByText('Too many attempts. Try again in 15 minutes.')).toBeInTheDocument();
  });
});
