import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { chooseLoginView } from './choose';
import { PasswordView } from './password-view';
import { LAST_USER_KEY, readRememberedUser, type RememberedUser } from './remembered';
import { UsernameView } from './username-view';

const HARI: RememberedUser = {
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: 'violet',
  remember: false,
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(HARI));
});

describe('US-AUTH-07', () => {
  it('Use another account forgets the remembered account and opens the list, keeping next', async () => {
    const { router } = renderScreen(() => <PasswordView username="hari" next="/files" />, {
      'auth.listLoginUsers': () => ({ users: [{ ...HARI, id: '1' }] }),
    });
    await screen.findByRole('link', { name: 'All users' }); // the list has loaded
    fireEvent.click(screen.getByRole('link', { name: 'Not Hari? Use another account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/users'));
    expect(router.state.location.search).toEqual({ next: '/files' });
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
  });

  it('with the list hidden it opens the username form with empty fields', async () => {
    const { router } = renderScreen(() => <PasswordView username="hari" />, {
      'auth.listLoginUsers': () => ({ users: [] }),
    });
    fireEvent.click(await screen.findByRole('link', { name: 'Not Hari? Use another account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/username'));
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();

    renderScreen(() => <UsernameView />, { 'auth.listLoginUsers': () => ({ users: [] }) });
    const [username] = await screen.findAllByLabelText('Username');
    expect(username).toHaveValue('');
  });

  it('logging in as someone else makes them the remembered account', async () => {
    localStorage.clear();
    renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': () => ({ users: [] }),
      'auth.login': () => ({ status: 'ok', redirectTo: '/' }),
      'auth.me': () => ({
        id: 'u2',
        username: 'anu',
        displayName: 'Anu',
        role: 'member',
        avatarColor: null,
        csrfToken: 'c',
      }),
    });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'anu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'another password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(readRememberedUser()?.username).toBe('anu'));
  });

  it('without usable storage (a private window) the remembered screen is never used', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    } as unknown as Storage;
    expect(readRememberedUser(blocked)).toBeNull();
    expect(chooseLoginView({ signedIn: false, remembered: readRememberedUser(blocked), listedUsers: 2 })).toEqual({
      to: '/login/users',
      search: {},
    });
  });
});
