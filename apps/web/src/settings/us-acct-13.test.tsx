import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen } from '../test/render';
import { SectionPage } from './section-page';
import { daysLeft, inviteLine, userLine, UsersSection } from './users-section';

const DAY = 86_400_000;
const NOW = Date.now();

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

const PEOPLE = [
  user({ id: 'u1', username: 'hari', displayName: 'Hari', role: 'admin', totpEnabled: true, lastActiveAt: NOW }),
  user({ id: 'u2', username: 'anu', displayName: 'Anu', lastActiveAt: NOW - DAY - 3_600_000, appCount: 4 }),
  user({ id: 'u3', username: 'ravi', displayName: 'Ravi', disabled: true, appCount: 1 }),
];
const INVITES = [
  { id: 'i1', role: 'member', displayName: null, createdAt: NOW - 60_000, expiresAt: NOW + 7 * DAY - 60_000, url: 'u' },
];

const Users = () => <SectionPage id="users" shippedPhase={3} />;

function renderUsers(overrides: Record<string, () => unknown> = {}) {
  return renderScreen(Users, {
    'auth.me': fakeMe(),
    'users.list': () => ({ users: PEOPLE }),
    'invites.list': () => ({ invites: INVITES }),
    ...overrides,
  });
}

describe('US-ACCT-13', () => {
  it('"People · n" counts users and pending invites, next to an "Invite someone" button', async () => {
    renderUsers();
    expect(await screen.findByRole('group', { name: 'People · 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite someone' })).toBeInTheDocument();
  });

  it('describes each person: (you), username, 2FA, last active, app count for members, and a role badge', async () => {
    renderUsers();
    const list = await screen.findByRole('group', { name: 'People · 4' });
    expect(within(list).getByText('(you)')).toBeInTheDocument();
    expect(within(list).getByText('@hari · 2FA on')).toBeInTheDocument();
    expect(within(list).getByText('@anu · 2FA off · last active yesterday · 4 apps')).toBeInTheDocument();
    expect(within(list).getByText('@ravi · 2FA off · not logged in yet · 1 app')).toBeInTheDocument();
    expect(within(list).getAllByText('Member')).toHaveLength(2);
    expect(within(list).getByText('Admin')).toBeInTheDocument();
  });

  it('member rows have Apps access, Reset password and More options; my own row has no actions', async () => {
    renderUsers();
    await screen.findByRole('group', { name: 'People · 4' });
    expect(screen.getAllByRole('button', { name: 'Apps access' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Reset password' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'More options for Anu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More options for Hari' })).toBeNull();
  });

  it('a disabled person is marked "Disabled" and their menu offers Enable', async () => {
    renderUsers();
    await screen.findByRole('group', { name: 'People · 4' });
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'More options for Ravi' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Enable' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Make admin' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Delete…' })).toBeInTheDocument();
  });

  it('shows skeleton rows while loading', async () => {
    renderUsers({ 'users.list': () => new Promise(() => {}) });
    expect(await screen.findAllByTestId('user-skeleton')).toHaveLength(3);
  });

  it('shows an inline error with "Try again" when the list fails, and retries', async () => {
    let fail = true;
    renderUsers({
      'users.list': () => {
        if (fail) throw daemonError('INTERNAL');
        return { users: PEOPLE };
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the people who use hlabs.");
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('group', { name: 'People · 4' })).toBeInTheDocument();
  });

  it('formats the lines', () => {
    expect(userLine(PEOPLE[1] as never, false, NOW)).toBe('@anu · 2FA off · last active yesterday · 4 apps');
    expect(userLine({ ...PEOPLE[1], lastActiveAt: NOW - 60_000 } as never, false, NOW)).toContain('active now');
    expect(inviteLine(INVITES[0] as never, NOW)).toBe('Link created today · expires in 7 days · Member');
    // A fresh invite a moment ahead of this clock still has 7 days; half a day left is 1 day.
    expect(daysLeft(NOW + 7 * DAY + 500, NOW)).toBe(7);
    expect(daysLeft(NOW + 6 * DAY + 3_600_000, NOW)).toBe(7);
    expect(daysLeft(NOW + DAY / 2, NOW)).toBe(1);
  });

  it('works with the component alone', async () => {
    renderScreen(UsersSection, {
      'auth.me': fakeMe(),
      'users.list': () => ({ users: PEOPLE }),
      'invites.list': () => ({ invites: [] }),
    });
    expect(await screen.findByRole('group', { name: 'People · 3' })).toBeInTheDocument();
  });
});
