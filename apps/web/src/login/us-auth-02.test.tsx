import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { UsernameView } from './username-view';
import { UsersView } from './users-view';

const shown = () => ({ users: [{ id: '1', username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: null }] });
const hidden = () => ({ users: [] });

describe('US-AUTH-02', () => {
  it('Other user opens the username form, keeping next', async () => {
    const { router } = renderScreen(() => <UsersView next="/files" />, { 'auth.listLoginUsers': shown });
    fireEvent.click(await screen.findByRole('button', { name: 'Other user, Enter username' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/username'));
    expect(router.state.location.search).toEqual({ next: '/files' });
  });

  it('the username form opens with the Username field focused and empty', async () => {
    renderScreen(() => <UsernameView />, { 'auth.listLoginUsers': shown });
    const username = await screen.findByLabelText('Username');
    await waitFor(() => expect(username).toHaveFocus());
    expect(username).toHaveValue('');
  });

  it('with the list shown, All users goes back to it', async () => {
    renderScreen(() => <UsernameView next="/files" />, { 'auth.listLoginUsers': shown });
    expect(await screen.findByRole('link', { name: 'All users' })).toHaveAttribute(
      'href',
      '/login/users?next=%2Ffiles',
    );
  });

  it('with the list hidden, the account list is never shown and there is no All users link', async () => {
    const { router } = renderScreen(() => <UsersView />, { 'auth.listLoginUsers': hidden });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/username'));
    expect(screen.queryByRole('list', { name: 'Accounts' })).toBeNull();

    renderScreen(() => <UsernameView />, { 'auth.listLoginUsers': hidden });
    await screen.findAllByLabelText('Username');
    expect(screen.queryByRole('link', { name: 'All users' })).toBeNull();
  });
});
