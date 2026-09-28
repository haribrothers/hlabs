import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { firstRunView } from '../onboarding/first-run';
import { Route as LoginIndexRoute } from '../routes/login.index';
import { renderScreen } from '../test/render';
import { chooseLoginView } from './choose';
import { PasswordView } from './password-view';
import { LAST_USER_KEY, type RememberedUser } from './remembered';

const HARI: RememberedUser = { username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: 'violet' };
const LoginIndex = LoginIndexRoute.options.component!;

beforeEach(() => localStorage.clear());

describe('US-AUTH-05', () => {
  it('chooses the screen: signed in, remembered, list, or username form, keeping next', () => {
    expect(chooseLoginView({ signedIn: true, remembered: HARI, listedUsers: 3, next: '/files' })).toEqual({
      href: '/files',
    });
    expect(chooseLoginView({ signedIn: true, remembered: null, listedUsers: 0, next: 'https://evil.example' })).toEqual(
      {
        href: '/',
      },
    );
    expect(chooseLoginView({ signedIn: false, remembered: HARI, listedUsers: 3, next: '/files' })).toEqual({
      to: '/login/password',
      search: { user: 'hari', next: '/files' },
    });
    expect(chooseLoginView({ signedIn: false, remembered: null, listedUsers: 3 })).toEqual({
      to: '/login/users',
      search: {},
    });
    expect(chooseLoginView({ signedIn: false, remembered: null, listedUsers: 0, next: '/x' })).toEqual({
      to: '/login/username',
      search: { next: '/x' },
    });
  });

  it('/login opens the list when nobody is remembered and it is shown', async () => {
    const { router } = renderScreen(LoginIndex, {
      'auth.me': () => Promise.reject(new Error('signed out')),
      'auth.listLoginUsers': () => ({ users: [{ ...HARI, id: '1' }] }),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/users'));
  });

  it('/login opens the remembered account', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(HARI));
    const { router } = renderScreen(LoginIndex, {
      'auth.me': () => Promise.reject(new Error('signed out')),
      'auth.listLoginUsers': () => ({ users: [] }),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/password'));
    expect(router.state.location.search).toEqual({ user: 'hari' });
  });

  it('/login with a session goes straight on, without a form', async () => {
    const { router } = renderScreen(LoginIndex, {
      'auth.me': () => ({ id: 'u1', username: 'hari', csrfToken: 'c' }),
      'auth.listLoginUsers': () => ({ users: [] }),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('the remembered account works with the list hidden, without an All users link', async () => {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(HARI));
    renderScreen(() => <PasswordView username="hari" />, { 'auth.listLoginUsers': () => ({ users: [] }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Hari' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'All users' })).toBeNull();
  });

  it('before onboarding is finished, /login goes to onboarding', () => {
    const status = { completed: false, step: 'account' as const };
    const base = { pathname: '/login', status, failed: false, dev: false };
    expect(firstRunView({ ...base, hasSetupToken: true })).toEqual({ kind: 'redirect', to: '/setup/account' });
    expect(firstRunView({ ...base, hasSetupToken: false })).toEqual({ kind: 'elsewhere' });
  });
});
