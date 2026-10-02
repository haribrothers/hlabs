import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen } from '../test/render';
import { AcceptInvite } from './accept-invite';
import { joinErrors } from './join-form';
import { LAST_USER_KEY } from './remembered';

const valid = {
  status: 'valid',
  inviterName: 'Hari',
  inviterAvatarColor: null,
  displayName: 'Anu',
  role: 'member',
  appCount: 2,
};
const signedOut = () => {
  throw daemonError('AUTH_REQUIRED');
};

beforeEach(() => localStorage.clear());

function open(accept: (input: unknown) => unknown, inspect: () => unknown = () => valid) {
  let joined = false;
  const r = renderScreen(() => <AcceptInvite token="tok" />, {
    'invites.inspect': inspect,
    'auth.me': () => (joined ? fakeMe({ username: 'anu', displayName: 'Anu', role: 'member' })() : signedOut()),
    'invites.accept': (input) => {
      const out = accept(input);
      joined = true;
      return out;
    },
  });
  return r;
}

const fill = async (o: { username?: string; password?: string } = {}) => {
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: o.username ?? 'Anu' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: o.password ?? 'correct horse battery' } });
};

describe('US-AUTH-24', () => {
  it('has the name (pre-filled from the invite), username and password fields, Join hlabs and the 7-day note', async () => {
    open(() => ({ redirectTo: '/' }));
    expect(await screen.findByLabelText('Your name')).toHaveValue('Anu');
    expect(screen.getByLabelText('Your name')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('Username')).toHaveAttribute('placeholder', 'lowercase, e.g. anu');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', 'At least 12 characters');
    expect(screen.getByRole('button', { name: 'Join hlabs' })).toBeInTheDocument();
    expect(screen.getByText('This invite link works once and expires in 7 days.')).toBeInTheDocument();
  });

  it('lowercases the username as I type, and explains the rules', async () => {
    open(() => ({ redirectTo: '/' }));
    await fill({ username: 'Anu' });
    expect(screen.getByLabelText('Username')).toHaveValue('anu');
    expect(joinErrors({ name: 'Anu', username: '1anu', password: 'correct horse battery' }).username).toBe(
      'Use 3–32 lowercase letters, numbers and dashes, starting with a letter.',
    );
    expect(joinErrors({ name: 'Anu', username: 'anu', password: 'short' }).password).toBe(
      'Use at least 12 characters.',
    );
    expect(joinErrors({ name: 'Anu', username: 'anu', password: 'password1234' }).password).toBe(
      'This password is too common. Try a longer phrase.',
    );
  });

  it('"That username is taken." under the field', async () => {
    open(() => {
      throw daemonError('USERNAME_TAKEN');
    });
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Join hlabs' }));
    expect(await screen.findByText('That username is taken.')).toBeInTheDocument();
  });

  it('joins, remembers the account on this device and goes Home', async () => {
    const { calls, router } = open(() => ({ redirectTo: '/' }));
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Join hlabs' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(calls.find((c) => c.path === 'invites.accept')?.input).toEqual({
      token: 'tok',
      displayName: 'Anu',
      username: 'anu',
      password: 'correct horse battery',
    });
    expect(JSON.parse(localStorage.getItem(LAST_USER_KEY)!)).toMatchObject({ username: 'anu', remember: false });
  });

  it('someone else used the link first: "This invite doesn\'t work anymore"', async () => {
    let status = 'valid';
    open(
      () => {
        status = 'used';
        throw daemonError('INVITE_INVALID');
      },
      () => ({ ...valid, status }),
    );
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Join hlabs' }));
    expect(await screen.findByRole('heading', { name: "This invite doesn't work anymore" })).toBeInTheDocument();
  });
});
