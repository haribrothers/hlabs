// US-AUTH-22 · Set a new password from an admin's reset link (ResetLink).
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { ResetView } from './reset-view';

const me = () => ({
  id: 'u2',
  username: 'anu',
  displayName: 'Anu',
  role: 'member',
  avatarColor: null,
  csrfToken: 'c',
  remember: false,
});

function type(value: string) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value } });
}

describe('US-AUTH-22', () => {
  it('shows "Choose a new password", a New password field and "Set password"', async () => {
    renderScreen(() => <ResetView token="t" />, {});
    expect(await screen.findByRole('heading', { level: 1, name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Set password' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'This link works once and expires 15 minutes after your admin made it. Your other devices will be signed out.',
      ),
    ).toBeInTheDocument();
  });

  it('a valid password is saved, and they are signed in and taken Home', async () => {
    const { calls } = renderScreen(
      () => <ResetView token="t" />,
      {
        'auth.resetPassword': () => ({ loggedIn: true, username: 'anu' }),
        'auth.me': me,
      },
      { path: '/reset/t' },
    );
    await screen.findByLabelText('New password');
    type('a brand new long passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() =>
      expect(calls.filter((c) => c.path === 'auth.resetPassword')).toEqual([
        { path: 'auth.resetPassword', input: { token: 't', newPassword: 'a brand new long passphrase' } },
      ]),
    );
    expect(await screen.findByText('elsewhere')).toBeInTheDocument();
  });

  it('an expired, used or unknown link says to ask the admin for a new one, with Back to log in', async () => {
    renderScreen(() => <ResetView token="t" />, {
      'auth.resetPassword': () => {
        throw daemonError('AUTH_RESET_EXPIRED');
      },
    });
    await screen.findByLabelText('New password');
    type('a brand new long passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText('This link has expired. Ask your admin for a new one.')).toHaveAttribute(
      'role',
      'alert',
    );
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Back to log in' })[0]).toHaveAttribute('href', '/login');
  });

  it('says what the password needs, as you type and on submit', async () => {
    const { calls } = renderScreen(() => <ResetView token="t" />, {});
    await screen.findByLabelText('New password');
    type('short');
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    type('password1234');
    expect(await screen.findByText('This password is too common. Try a longer phrase.')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === 'auth.resetPassword')).toEqual([]);
  });
});
