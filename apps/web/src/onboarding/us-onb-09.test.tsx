import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { accountErrors, serverFieldError } from './account-form';
import { AccountStep } from './account-step';

const USERNAME_ERROR = 'Use 3–32 lowercase letters, numbers and dashes, starting with a letter, e.g. hari';
const valid = { name: 'Hari', username: 'hari', password: 'correct horse battery', confirm: 'correct horse battery' };

function fill(values: Partial<typeof valid>) {
  const labels = { name: 'Your name', username: 'Username', password: 'Password', confirm: 'Confirm password' };
  for (const [key, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(labels[key as keyof typeof labels]), { target: { value } });
  }
}

describe('US-ONB-09', () => {
  it('checks each field by the daemon rules, lowercasing the username first', () => {
    expect(accountErrors(valid)).toEqual({});
    expect(accountErrors({ ...valid, username: 'Hari' })).toEqual({});
    expect(accountErrors({ ...valid, username: 'hari_p' }).username).toBe(USERNAME_ERROR);
    expect(accountErrors({ ...valid, username: '1hari' }).username).toBe(USERNAME_ERROR);
    expect(accountErrors({ ...valid, password: 'short', confirm: 'short' }).password).toBe(
      'Weak · use at least 12 characters',
    );
    expect(accountErrors({ ...valid, password: 'q1w2e3r4t5y6', confirm: 'q1w2e3r4t5y6' }).password).toBe(
      'This password is too common',
    );
    expect(accountErrors({ ...valid, confirm: 'other' }).confirm).toBe("Passwords don't match");
    expect(USERNAME_ERROR).not.toContain('_');
  });

  it('maps the daemon codes to the same field errors', () => {
    expect(serverFieldError('USERNAME_INVALID')).toEqual({ field: 'username', message: USERNAME_ERROR });
    expect(serverFieldError('USERNAME_TAKEN')?.field).toBe('username');
    expect(serverFieldError('PASSWORD_TOO_SHORT')).toEqual({
      field: 'password',
      message: 'Weak · use at least 12 characters',
    });
    expect(serverFieldError('PASSWORD_TOO_COMMON')?.message).toBe('This password is too common');
    expect(serverFieldError('INTERNAL')).toBeNull();
  });

  it('shows a username error when the field loses focus, linked to the field', async () => {
    renderScreen(AccountStep, {});
    const username = await screen.findByLabelText('Username');
    fireEvent.change(username, { target: { value: 'Hari Prasad' } });
    expect(username).not.toHaveAttribute('aria-invalid');
    fireEvent.blur(username);
    expect(username).toHaveAttribute('aria-invalid', 'true');
    expect(username).toHaveAccessibleDescription(USERNAME_ERROR);
  });

  it('shows a weak or common password in the error style, and a mismatched confirmation', async () => {
    renderScreen(AccountStep, {});
    const password = await screen.findByLabelText('Password');
    fireEvent.change(password, { target: { value: 'short' } });
    fireEvent.blur(password);
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Weak · use at least 12 characters').closest('.hl-field')).toHaveClass('hl-field-error');
    fireEvent.change(password, { target: { value: 'q1w2e3r4t5y6' } });
    expect(screen.getByText('This password is too common')).toBeInTheDocument();

    const confirm = screen.getByLabelText('Confirm password');
    fireEvent.change(confirm, { target: { value: 'something else' } });
    fireEvent.blur(confirm);
    expect(confirm).toHaveAccessibleDescription("Passwords don't match");
  });

  it('on submit sends nothing, counts what to fix and focuses the first invalid field', async () => {
    const createAdmin = vi.fn();
    renderScreen(AccountStep, { 'onboarding.createAdmin': createAdmin });
    await screen.findByLabelText('Your name');
    fill({ name: 'Hari', username: 'Hari Prasad', password: 'correct horse battery', confirm: 'nope' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Fix 2 things to continue.')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveFocus();
    expect(createAdmin).not.toHaveBeenCalled();

    // Fixing a field clears its error at once and updates the count; the summary goes at 0.
    fill({ username: 'hari' });
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Fix 1 thing to continue.')).toBeInTheDocument();
    fill({ confirm: 'correct horse battery' });
    expect(screen.queryByText(/to continue\./)).toBeNull();
  });

  it('shows the daemon refusal on its field from the code, never the raw message', async () => {
    const createAdmin = vi.fn(() => Promise.reject(daemonError('USERNAME_TAKEN')));
    renderScreen(AccountStep, { 'onboarding.createAdmin': createAdmin });
    await screen.findByLabelText('Your name');
    fill(valid);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const username = screen.getByLabelText('Username');
    await waitFor(() =>
      expect(username).toHaveAccessibleDescription('That username is already taken. Choose another.'),
    );
    expect(username).toHaveFocus();
    expect(screen.queryByText('USERNAME_TAKEN')).toBeNull();
    expect(screen.getByText('Fix 1 thing to continue.')).toBeInTheDocument();

    fill({ username: 'hari2' });
    expect(username).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(/to continue\./)).toBeNull();
  });
});
