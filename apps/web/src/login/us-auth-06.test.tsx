import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { PasswordView } from './password-view';
import { LAST_USER_KEY, type RememberedUser } from './remembered';

const HARI: RememberedUser = {
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: 'violet',
  remember: false,
};
const me = () => ({
  id: 'u1',
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: 'violet',
  csrfToken: 'c',
});
const listed =
  (role = 'admin') =>
  () => ({ users: [{ ...HARI, role, id: '1' }] });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(LAST_USER_KEY, JSON.stringify(HARI));
});

async function logIn(password: string) {
  fireEvent.change(await screen.findByPlaceholderText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('US-AUTH-06', () => {
  it('greets the remembered account as saved at its last log-in, with the password focused', async () => {
    // The list says member now; the screen keeps the role saved at the last log-in.
    const { container } = renderScreen(() => <PasswordView username="hari" />, {
      'auth.listLoginUsers': listed('member'),
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Hari' })).toBeInTheDocument();
    expect(screen.getByText('@hari · Admin')).toBeInTheDocument();
    expect(container.querySelector('.hl-avatar')).toHaveTextContent('H');
    expect(container.querySelector('.hl-avatar')).toHaveAttribute('data-accent', 'violet');
    await waitFor(() => expect(screen.getByPlaceholderText('Password')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Not Hari? Use another account' })).toBeInTheDocument();
  });

  it('the right password logs in the same way as the username form', async () => {
    const { router } = renderScreen(() => <PasswordView username="hari" next="/files" />, {
      'auth.listLoginUsers': listed(),
      'auth.login': () => ({ status: 'ok', redirectTo: '/files' }),
      'auth.me': me,
    });
    await logIn('correct horse battery');
    await waitFor(() => expect(router.state.location.pathname).toBe('/files'));
  });

  it('a wrong password says "Password is incorrect." and clears it', async () => {
    renderScreen(() => <PasswordView username="hari" />, {
      'auth.listLoginUsers': listed(),
      'auth.login': () => Promise.reject(daemonError('AUTH_INVALID_CREDENTIALS')),
    });
    await logIn('wrong');
    const password = screen.getByPlaceholderText('Password');
    await waitFor(() => expect(password).toHaveAccessibleDescription('Password is incorrect.'));
    expect(password).toHaveValue('');
  });

  it('All users is there when the list is shown, and not when it is hidden', async () => {
    renderScreen(() => <PasswordView username="hari" />, { 'auth.listLoginUsers': listed() });
    expect(await screen.findByRole('link', { name: 'All users' })).toBeInTheDocument();
  });

  it('with the list hidden there is no All users link', async () => {
    renderScreen(() => <PasswordView username="hari" />, { 'auth.listLoginUsers': () => ({ users: [] }) });
    await screen.findByRole('heading', { level: 1, name: 'Welcome back, Hari' });
    expect(screen.queryByRole('link', { name: 'All users' })).toBeNull();
  });

  it('a remembered account that was removed gets the same error and stays remembered', async () => {
    renderScreen(() => <PasswordView username="hari" />, {
      'auth.listLoginUsers': () => ({
        users: [{ id: '2', username: 'anu', displayName: 'Anu', role: 'member', avatarColor: null }],
      }),
      'auth.login': () => Promise.reject(daemonError('AUTH_INVALID_CREDENTIALS')),
    });
    await logIn('correct horse battery');
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Password')).toHaveAccessibleDescription('Password is incorrect.'),
    );
    expect(JSON.parse(localStorage.getItem(LAST_USER_KEY)!)).toEqual(HARI);
  });
});
