// US-PHONE-05 · Log in on a phone: the first view follows the desktop's rules (US-AUTH-05); the username form with
// "Remember this phone" off, a full-width Log in and Forgot password?; the remembered-user and list views with the
// same switch; the footer's "via Tailscale"; the Go key, the spinner and the errors; fields password managers fill.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { phoneViewport } from '../test/phone';
import { chooseLoginView } from './choose';
import { phoneHostLine } from './login-layout';
import { PasswordView } from './password-view';
import { writeRememberedUser } from './remembered';
import { UsernameView } from './username-view';
import { UsersView } from './users-view';

const me = () => ({
  id: 'u1',
  username: 'hari',
  displayName: 'Hari',
  role: 'admin',
  avatarColor: null,
  csrfToken: 'c',
});
const noList = () => ({ users: [] });
const twoUsers = () => ({
  users: [
    { id: 'u1', username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: null },
    { id: 'u2', username: 'priya', displayName: 'Priya', role: 'member', avatarColor: null },
  ],
});

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
  localStorage.clear();
});
afterEach(() => restore());

describe('US-PHONE-05', () => {
  it('picks the first view as on the desktop: remembered user, else the list, else the form', () => {
    const remembered = {
      username: 'hari',
      displayName: 'Hari',
      role: 'admin' as const,
      avatarColor: null,
      remember: true,
    };
    const to = (r: typeof remembered | null, listedUsers: number) =>
      (chooseLoginView({ signedIn: false, remembered: r, listedUsers }) as { to: string }).to;
    expect(to(remembered, 2)).toBe('/login/password');
    expect(to(null, 2)).toBe('/login/users');
    expect(to(null, 0)).toBe('/login/username');
  });

  it('the form: logo, title, both fields, "Remember this phone" off, a full-width Log in and Forgot password?', async () => {
    renderScreen(() => <UsernameView />, { 'auth.listLoginUsers': noList });
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in to hlabs' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Remember this phone' })).toHaveAttribute('aria-checked', 'false');
    // Full width (D-172: hl-p-primary is 100% wide, 50px tall).
    expect(screen.getByRole('button', { name: 'Log in' })).toHaveClass('hl-p-primary');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('fields password managers can fill: no capitals or corrections in Username, a show/hide Password', async () => {
    renderScreen(() => <UsernameView />, { 'auth.listLoginUsers': noList });
    const user = await screen.findByLabelText('Username');
    expect(user).toHaveAttribute('autocapitalize', 'none');
    expect(user).toHaveAttribute('autocorrect', 'off');
    expect(user).toHaveAttribute('autocomplete', 'username');
    expect(user).toHaveAttribute('enterkeyhint', 'next');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('enterkeyhint', 'go');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
  });

  it('Go logs in, remembered for 30 days when the switch is on, and goes to next', async () => {
    const login = vi.fn(() => ({ status: 'ok', redirectTo: '/files' }));
    const { router } = renderScreen(() => <UsernameView next="/files" />, {
      'auth.listLoginUsers': noList,
      'auth.login': login,
      'auth.me': me,
    });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'hari' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Remember this phone' }));
    fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/files'));
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ username: 'hari', remember: true }));
  });

  it('while it runs the button spins and is disabled; a wrong password says so under the field', async () => {
    let fail!: (e: unknown) => void;
    renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': noList,
      'auth.login': () => new Promise((_, reject) => (fail = reject)),
    });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'hari' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    const button = await screen.findByRole('button', { name: 'Log in' });
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'));
    expect(button).toBeDisabled();
    fail(daemonError('AUTH_INVALID_CREDENTIALS'));
    expect(await screen.findByText(/username or password/i)).toBeInTheDocument();
  });

  it('the remembered user gets only Password, with the same switch, button and link', async () => {
    writeRememberedUser({ username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: null, remember: true });
    renderScreen(() => <PasswordView username="hari" />, { 'auth.listLoginUsers': noList });
    expect(await screen.findByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Remember this phone' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('the list has one full-width row per person, the chosen one ticked, and the same password, switch and button', async () => {
    const login = vi.fn(() => ({ status: 'ok', redirectTo: '/' }));
    const { router } = renderScreen(() => <UsersView />, {
      'auth.listLoginUsers': twoUsers,
      'auth.login': login,
      'auth.me': me,
    });
    const group = await screen.findByRole('group', { name: "Who's using hlabs?" });
    const hari = screen.getByRole('button', { name: 'Hari, Admin' });
    const priya = screen.getByRole('button', { name: 'Priya, Member' });
    expect(hari).toHaveClass('hl-p-row');
    expect(group).toContainElement(priya);
    expect(hari).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Other user, Enter username' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Remember this phone' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument();
    fireEvent.click(priya);
    expect(priya).toHaveAttribute('aria-pressed', 'true');
    expect(hari).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(login).toHaveBeenCalledWith(expect.objectContaining({ username: 'priya' })));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('the footer says "via Tailscale" on the tailnet name, and only the host elsewhere', () => {
    expect(phoneHostLine({ host: 'hlabs.tail1234.ts.net', hostname: 'hlabs.tail1234.ts.net' })).toBe(
      'via Tailscale · hlabs.tail1234.ts.net',
    );
    expect(phoneHostLine({ host: 'hlabs.local', hostname: 'hlabs.local' })).toBe('hlabs.local');
  });
});
