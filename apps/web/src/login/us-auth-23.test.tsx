import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen } from '../test/render';
import { AcceptInvite, inviteLead } from './accept-invite';
import { firstRunView } from '../onboarding/first-run';
import { loginRedirect } from './signed-out';

const valid = (o: Record<string, unknown> = {}) => ({
  status: 'valid',
  inviterName: 'Hari',
  inviterAvatarColor: 'violet',
  displayName: null,
  role: 'member',
  appCount: 4,
  ...o,
});
const signedOut = () => {
  throw daemonError('AUTH_REQUIRED');
};

function open(invite: unknown, me: () => unknown = signedOut) {
  return renderScreen(() => <AcceptInvite token="tok" />, {
    'invites.inspect': () => invite,
    'auth.me': me,
    'auth.logout': () => ({ ok: true }),
  });
}

describe('US-AUTH-23', () => {
  it('a valid invite shows who invited me, "Create your account" and how many apps were shared', async () => {
    open(valid());
    expect(await screen.findByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument();
    expect(screen.getByText('Hari invited you to')).toBeInTheDocument();
    expect(screen.getByText('hlabs · home cloud')).toBeInTheDocument();
    expect(
      screen.getByText("You'll get your own Home screen and a private Files folder. Hari has shared 4 apps with you."),
    ).toBeInTheDocument();
  });

  it('leaves out the apps sentence for none, says "1 app" for one, and tells an admin they open every app', () => {
    const base = { inviterName: 'Hari' };
    expect(inviteLead({ ...base, role: 'member', appCount: 0 })).toBe(
      "You'll get your own Home screen and a private Files folder.",
    );
    expect(inviteLead({ ...base, role: 'member', appCount: 1 })).toContain('Hari has shared 1 app with you.');
    expect(inviteLead({ ...base, role: 'admin', appCount: 0 })).toBe(
      "You'll get your own Home screen and a private Files folder. You'll be an admin and can open every app.",
    );
  });

  it.each(['expired', 'used', 'revoked'])(
    "a %s invite says it doesn't work anymore, with a way to log in",
    async (status) => {
      open({ ...valid(), status, role: null });
      expect(await screen.findByRole('heading', { name: "This invite doesn't work anymore" })).toBeInTheDocument();
      expect(screen.getByText('Ask Hari for a new link.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Go to log in' })).toHaveAttribute('href', '/login');
      expect(screen.queryByRole('heading', { name: 'Create your account' })).toBeNull();
    },
  );

  it('an unknown link asks for "your admin"', async () => {
    open({ ...valid(), status: 'expired', inviterName: null, role: null });
    expect(await screen.findByText('Ask your admin for a new link.')).toBeInTheDocument();
  });

  it('already signed in: says who as, and "Log out and continue" logs out and stays here', async () => {
    let signedIn = true;
    const { calls } = open(valid(), () => (signedIn ? fakeMe({ username: 'ravi' })() : signedOut()));
    expect(await screen.findByText("You're logged in as @ravi.")).toBeInTheDocument();
    signedIn = false;
    fireEvent.click(screen.getByRole('button', { name: 'Log out and continue' }));
    await waitFor(() => expect(screen.queryByText("You're logged in as @ravi.")).toBeNull());
    expect(calls.some((c) => c.path === 'auth.logout')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  });

  it('invite links open without a session and without the Dock', () => {
    const status = { completed: true, hasUsers: true, step: 'done' } as never;
    expect(firstRunView({ pathname: '/invite/tok', status, failed: false, hasSetupToken: false, dev: false })).toEqual({
      kind: 'plain',
    });
    expect(loginRedirect({ pathname: '/invite/tok', href: '/invite/tok' })).toBeNull();
  });
});
