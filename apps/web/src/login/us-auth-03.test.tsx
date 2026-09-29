import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../test/render';
import { hostLine } from './login-layout';
import { LAST_USER_KEY } from './remembered';
import { UsernameView } from './username-view';

const me = () => ({
  id: 'u1',
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: null,
  csrfToken: 'c',
});
const list = () => ({ users: [] });

function fill(username: string, password: string) {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

beforeEach(() => localStorage.clear());

describe('US-AUTH-03', () => {
  it('shows the username form with remember me off and Log in disabled until both fields are filled', async () => {
    renderScreen(() => <UsernameView />, { 'auth.listLoginUsers': list });
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in to hlabs' })).toBeInTheDocument();
    expect(screen.getByText('Use the username your admin gave you')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('placeholder', 'e.g. hari');
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocapitalize', 'none');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('switch', { name: 'Remember me on this device' })).toHaveAttribute('aria-checked', 'false');
    const logIn = screen.getByRole('button', { name: 'Log in' });
    expect(logIn).toBeDisabled();
    fill('hari', '');
    expect(logIn).toBeDisabled();
    fill('hari', 'secret');
    expect(logIn).toBeEnabled();
  });

  it('Enter submits the trimmed, lowercased username; fields are read-only while it runs', async () => {
    let finish!: (v: unknown) => void;
    const login = vi.fn(() => new Promise((r) => (finish = r)));
    const { router } = renderScreen(() => <UsernameView next="/files" />, {
      'auth.listLoginUsers': list,
      'auth.login': login,
      'auth.me': me,
    });
    await screen.findByLabelText('Username');
    fill('Hari ', 'correct horse battery');
    fireEvent.click(screen.getByRole('switch', { name: 'Remember me on this device' }));
    fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Log in' })).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByLabelText('Username')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Password')).toHaveAttribute('readonly');
    expect(login).toHaveBeenCalledWith({
      username: 'hari',
      password: 'correct horse battery',
      remember: true,
      next: '/files',
    });

    finish({ status: 'ok', redirectTo: '/files' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/files'));
    expect(JSON.parse(localStorage.getItem(LAST_USER_KEY)!)).toEqual({
      username: 'hari',
      displayName: 'Hari',
      role: 'admin',
      avatarColor: null,
    });
  });

  it('with two-factor on, the password step goes to the code step', async () => {
    const { router } = renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': list,
      'auth.login': () => ({ status: 'totp_required', challengeId: 'ch1' }),
    });
    await screen.findByLabelText('Username');
    fill('hari', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/code'));
    expect(router.state.location.search).toEqual({ challenge: 'ch1', user: 'hari', from: 'username' });
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
  });

  it('the footer names the host, and says HTTPS only when it is', () => {
    expect(hostLine({ host: 'hlabs.local', protocol: 'https:' })).toBe('hlabs.local · secured with HTTPS');
    expect(hostLine({ host: '127.0.0.1:5173', protocol: 'http:' })).toBe('127.0.0.1:5173');
  });
});
