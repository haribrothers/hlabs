import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAuthLost, queryClient, setAuthLostHandler } from '../lib/trpc';
import { daemonError, renderScreen } from '../test/render';
import { PasswordView } from './password-view';
import { LAST_USER_KEY, readRememberedUser, type RememberedUser } from './remembered';
import { loginRedirect } from './signed-out';
import { UsernameView } from './username-view';

const HARI: RememberedUser = {
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: 'violet',
  remember: true,
};
const me = (remember: boolean) => () => ({
  id: 'u1',
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: 'violet',
  csrfToken: 'c',
  remember,
});

beforeEach(() => localStorage.clear());

describe('US-AUTH-14', () => {
  it('the remembered-account screen has no switch and sends the choice from its last log-in here', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(HARI));
    const login = vi.fn(() => ({ status: 'ok', redirectTo: '/' }));
    renderScreen(() => <PasswordView username="hari" />, {
      'auth.listLoginUsers': () => ({ users: [] }),
      'auth.login': login,
      'auth.me': me(true),
    });
    fireEvent.change(await screen.findByPlaceholderText('Password'), { target: { value: 'pw' } });
    expect(screen.queryByRole('switch')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(login).toHaveBeenCalled());
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ username: 'hari', remember: true }));
  });

  it('a log-in saves its remember choice with the remembered account', async () => {
    renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': () => ({ users: [] }),
      'auth.login': () => ({ status: 'ok', redirectTo: '/' }),
      'auth.me': me(true),
    });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'hari' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Remember me on this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(readRememberedUser()?.remember).toBe(true));
  });

  it('signed out on a dashboard page: log in, then come back to it', () => {
    expect(loginRedirect({ pathname: '/files', href: '/files?path=%2Fdocs' })).toEqual({
      to: '/login',
      search: { next: '/files?path=%2Fdocs' },
    });
    expect(loginRedirect({ pathname: '/', href: '/' })).toEqual({ to: '/login', search: {} });
    expect(loginRedirect({ pathname: '/login/users', href: '/login/users' })).toBeNull();
    expect(loginRedirect({ pathname: '/setup/storage', href: '/setup/storage' })).toBeNull();
    // Nobody has an account yet (a development shortcut): there's no one to log in as.
    expect(loginRedirect({ pathname: '/files', href: '/files' }, { hasUsers: false })).toBeNull();
  });

  it('any call that finds the session gone triggers the log-in redirect', async () => {
    const lost = vi.fn();
    setAuthLostHandler(lost);
    expect(isAuthLost(daemonError('AUTH_REQUIRED'))).toBe(true);
    expect(isAuthLost(daemonError('ACCESS_DENIED'))).toBe(false);
    await queryClient
      .fetchQuery({
        queryKey: ['us-auth-14'],
        queryFn: () => Promise.reject(daemonError('AUTH_REQUIRED')),
        retry: false,
      })
      .catch(() => {});
    expect(lost).toHaveBeenCalledTimes(1);
    setAuthLostHandler(null);
  });
});
