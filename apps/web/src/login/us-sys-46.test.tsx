// US-SYS-46 · Sign in to the public dashboard: LoginPublic (a username typed, no list, no "Remember me", the
// two-factor note and the foot "From the internet · <host>"), two-factor always next, no two-factor → the story's
// words and no session, too many tries, sessions listed as "Public dashboard at <host>", "Sign out everywhere" from
// the new-sign-in notification, and setup, invites and reset links never served there.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen } from '../test/render';
import { actionsFromNotification, runToastMutation, visibleActions } from '../lib/toast-actions';
import { SignedInDevices } from '../settings/signed-in-devices';
import { AcceptInvite } from './accept-invite';
import { chooseLoginView } from './choose';
import { LAST_USER_KEY } from './remembered';
import { ResetView } from './reset-view';
import { UsernameView } from './username-view';

const fromInternet = () => ({ users: [], via: 'public' });
const atHome = () => ({ users: [], via: 'home' });

function fill(username: string, password: string) {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

beforeEach(() => localStorage.clear());

describe('US-SYS-46', () => {
  it('the sign-in there asks for a username and password: no list, no "Remember me", two-factor said', async () => {
    renderScreen(() => <UsernameView />, { 'auth.listLoginUsers': fromInternet });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in to hlabs' })).toBeInTheDocument();
    expect(screen.getByText('Two-factor login is needed from the internet.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/Remember/)).toBeNull();
    expect(screen.getByText('Forgot your password? Ask the person who runs this hlabs.')).toBeInTheDocument();
    expect(screen.getByText(/From the internet ·/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('at home the usual form shows, with "Remember me"', async () => {
    renderScreen(() => <UsernameView />, { 'auth.listLoginUsers': atHome });
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in to hlabs' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Remember me on this device' })).toBeInTheDocument();
  });

  it('a right password goes on to the code, never remembering the account', async () => {
    const login = vi.fn(() => ({ status: 'totp_required', challengeId: 'ch1' }));
    const { router } = renderScreen(
      () => <UsernameView />,
      { 'auth.listLoginUsers': fromInternet, 'auth.login': login },
      { path: '/login/username', routes: { '/login/code': () => <p>code step</p> } },
    );
    await screen.findByLabelText('Username');
    fill('Hari', 'correct horse');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('code step')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith({ username: 'hari', password: 'correct horse', remember: false });
    expect(router.state.location.search).toMatchObject({ challenge: 'ch1', user: 'hari', from: 'username' });
    expect(localStorage.getItem(LAST_USER_KEY)).toBeNull();
  });

  it('someone without two-factor is told to turn it on at home, and gets no session', async () => {
    renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': fromInternet,
      'auth.login': () => Promise.reject(daemonError('AUTH_TWO_FACTOR_REQUIRED')),
    });
    await screen.findByLabelText('Username');
    fill('ravi', 'pw');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Turn on two-factor login first. Signing in from the internet needs it. Turn it on in hlabs at home, under Settings › Account.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
  });

  it('too many tries: "Too many tries. Try again in 15 minutes.", and Continue waits', async () => {
    renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': fromInternet,
      'auth.login': () => Promise.reject(daemonError('AUTH_LOCKED', { retryAfterSeconds: 900 })),
    });
    await screen.findByLabelText('Username');
    fill('hari', 'pw');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many tries. Try again in 15 minutes.');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('the address over the limit is refused for about an hour', async () => {
    renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': fromInternet,
      'auth.login': () => Promise.reject(daemonError('AUTH_LOCKED', { retryAfterSeconds: 3600, address: true })),
    });
    await screen.findByLabelText('Username');
    fill('hari', 'pw');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many tries from this network. Try again in about an hour.',
    );
  });

  it('/login there always opens the typed sign-in, whoever this device remembers', () => {
    expect(
      chooseLoginView({
        signedIn: false,
        remembered: { username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: null, remember: true },
        listedUsers: 0,
        publicAddress: true,
      }),
    ).toEqual({ to: '/login/username', search: {} });
  });

  it('a session there is listed as "Public dashboard at hlabs.example.com"', async () => {
    const now = Date.now();
    renderScreen(SignedInDevices, {
      'auth.listSessions': () => ({
        items: [
          {
            id: 'p',
            current: false,
            userAgent:
              'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari',
            ip: '198.51.100.20',
            createdAt: 0,
            lastSeenAt: now,
            publicHost: 'hlabs.example.com',
            publicDashboard: true,
          },
          {
            id: 'a',
            current: false,
            userAgent:
              'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Safari',
            ip: '198.51.100.21',
            createdAt: 0,
            lastSeenAt: now,
            publicHost: 'photos.example.com',
            publicDashboard: false,
          },
        ],
      }),
    });
    expect(await screen.findByText(/Public dashboard at hlabs\.example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/Public app at photos\.example\.com/)).toBeInTheDocument();
  });

  it('"Sign out everywhere" on the new-sign-in notification runs for anyone, members too', async () => {
    const actions = actionsFromNotification([
      { kind: 'mutation', procedure: 'auth.revokeOtherSessions', input: {}, label: 'Sign out everywhere' },
    ]);
    expect(visibleActions(actions, { isAdmin: false }).map((a) => a.label)).toEqual(['Sign out everywhere']);
    const mutate = vi.fn(async () => ({ ended: 2 }));
    await runToastMutation({ auth: { revokeOtherSessions: { mutate } } } as never, 'auth.revokeOtherSessions', {});
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('an invite link there says "Open this at home or on your tailnet."', async () => {
    const inspect = vi.fn(() => Promise.reject(daemonError('HOME_ONLY', { procedure: 'invites.inspect' })));
    renderScreen(() => <AcceptInvite token="t" />, {
      'auth.listLoginUsers': fromInternet,
      'invites.inspect': inspect,
      'auth.me': () => Promise.reject(daemonError('AUTH_REQUIRED')),
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Open this at home or on your tailnet.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create account|Join/ })).toBeNull();
  });

  it('a reset link there says the same, and never shows the form', async () => {
    renderScreen(() => <ResetView token="t" />, { 'auth.listLoginUsers': fromInternet, 'auth.me': fakeMe() });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Open this at home or on your tailnet.' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('New password')).toBeNull());
  });
});
