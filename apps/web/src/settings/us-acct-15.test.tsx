import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster } from '../shell/toaster';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen } from '../test/render';
import { SectionPage } from './section-page';

const user = (o: Record<string, unknown>) => ({
  id: 'x',
  username: 'x',
  displayName: 'X',
  role: 'member',
  avatarColor: null,
  totpEnabled: false,
  lastActiveAt: null,
  disabled: false,
  appCount: 0,
  ...o,
});

function renderUsers(people: unknown[], handlers: Record<string, (input: unknown) => unknown> = {}) {
  return renderScreen(
    () => (
      <>
        <SectionPage id="users" shippedPhase={3} />
        <Toaster />
      </>
    ),
    {
      'auth.me': fakeMe(),
      'users.list': () => ({ users: people }),
      'invites.list': () => ({ invites: [] }),
      'users.updateRole': () => ({ ok: true }),
      'users.disable': () => ({ ok: true }),
      'users.enable': () => ({ ok: true }),
      ...handlers,
    },
  );
}

const openMenu = async (name: string) => {
  fireEvent.keyDown(await screen.findByRole('button', { name: `More options for ${name}` }), { key: 'Enter' });
  return screen.findByRole('menu');
};

describe('US-ACCT-15', () => {
  it('the menu offers Make admin, Disable and Delete… for a member', async () => {
    renderUsers([user({ id: 'u1', username: 'hari', role: 'admin' }), user({ id: 'u2', displayName: 'Anu' })]);
    const menu = await openMenu('Anu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual(['Make admin', 'Disable', 'Delete…']);
  });

  it('Make admin asks first: "Anu will be able to change everything."', async () => {
    const { calls } = renderUsers([user({ id: 'u2', displayName: 'Anu' })]);
    fireEvent.click(within(await openMenu('Anu')).getByRole('menuitem', { name: 'Make admin' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Make Anu an admin?' });
    expect(dialog).toHaveTextContent('Anu will be able to change everything.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make admin' }));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'users.updateRole')?.input).toEqual({ userId: 'u2', role: 'admin' }),
    );
    expect(await screen.findByText('Anu is now an admin')).toBeInTheDocument();
  });

  it('Disable asks first; the last admin is refused with "hlabs needs at least one admin."', async () => {
    renderUsers([user({ id: 'u2', displayName: 'Mia', role: 'admin' })], {
      'users.disable': () => {
        throw daemonError('LAST_ADMIN');
      },
    });
    fireEvent.click(within(await openMenu('Mia')).getByRole('menuitem', { name: 'Disable' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disable Mia?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disable' }));
    expect(await within(dialog).findByText(/hlabs needs at least one admin\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('Enable on a disabled person lets them in again', async () => {
    const { calls } = renderUsers([user({ id: 'u2', displayName: 'Ravi', disabled: true })]);
    fireEvent.click(within(await openMenu('Ravi')).getByRole('menuitem', { name: 'Enable' }));
    await waitFor(() => expect(calls.find((c) => c.path === 'users.enable')?.input).toEqual({ userId: 'u2' }));
    expect(await screen.findByText('Ravi can log in again')).toBeInTheDocument();
  });
});
