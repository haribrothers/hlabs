import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { PasswordView } from './password-view';
import { UsersView } from './users-view';

const USERS = [
  { id: '1', username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: 'violet' },
  { id: '2', username: 'anu', displayName: 'Anu', role: 'member', avatarColor: null },
  { id: '3', username: 'bea', displayName: 'Bea <b>', role: 'member', avatarColor: 'amber' },
];
const list = () => ({ users: USERS });

describe('US-AUTH-01', () => {
  it('shows who can log in, in the order given, with names and roles', async () => {
    renderScreen(() => <UsersView />, { 'auth.listLoginUsers': list });
    expect(await screen.findByRole('heading', { level: 1, name: "Who's using hlabs?" })).toBeInTheDocument();
    expect(screen.getByText('Choose your account to log in')).toBeInTheDocument();
    const accounts = screen.getByRole('list', { name: 'Accounts' });
    await within(accounts).findByRole('button', { name: 'Hari, Admin' });
    const tiles = within(accounts).getAllByRole('button');
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Hari, Admin',
      'Anu, Member',
      'Bea <b>, Member',
      'Other user, Enter username',
    ]);
    // Names are text, never HTML.
    expect(within(accounts).getByText('Bea <b>')).toBeInTheDocument();
    expect(screen.getByText('Admins can hide this list in Settings › Users')).toBeInTheDocument();
  });

  it('shows three placeholders while loading', () => {
    renderScreen(() => <UsersView />, { 'auth.listLoginUsers': () => new Promise(() => {}) });
    return waitFor(() => expect(screen.getAllByTestId('user-skeleton')).toHaveLength(3));
  });

  it('falls back to the username form when the list can not be loaded', async () => {
    const { router } = renderScreen(() => <UsersView next="/files" />, {
      'auth.listLoginUsers': () => Promise.reject(new Error('down')),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/username'));
    expect(router.state.location.search).toEqual({ next: '/files' });
  });

  it('arrow keys move between accounts; choosing one opens its password screen, keeping next', async () => {
    const { router } = renderScreen(() => <UsersView next="/files" />, { 'auth.listLoginUsers': list });
    const hari = await screen.findByRole('button', { name: 'Hari, Admin' });
    hari.focus();
    fireEvent.keyDown(hari, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Anu, Member' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(hari).toHaveFocus();
    fireEvent.click(hari);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/password'));
    expect(router.state.location.search).toEqual({ user: 'hari', next: '/files' });
  });

  it('the password screen greets the chosen account with the password focused', async () => {
    renderScreen(() => <PasswordView username="hari" />, { 'auth.listLoginUsers': list });
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back, Hari' })).toBeInTheDocument();
    expect(screen.getByText('@hari · Admin')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText('Password')).toHaveFocus());
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('link', { name: 'All users' })).toHaveAttribute('href', '/login/users');
  });
});
