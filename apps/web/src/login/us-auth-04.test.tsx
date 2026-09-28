import { fireEvent, screen, waitFor } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { loginFailure } from './use-login';
import { UsernameView } from './username-view';

const list = () => ({ users: [] });

async function submit(username: string, password: string) {
  fireEvent.change(await screen.findByLabelText('Username'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('US-AUTH-04', () => {
  it('tells failures apart without revealing which accounts exist', () => {
    expect(loginFailure(daemonError('AUTH_INVALID_CREDENTIALS'))).toBe('credentials');
    expect(loginFailure(daemonError('AUTH_LOCKED'))).toBe('locked');
    expect(loginFailure(daemonError('DAEMON_STARTING'))).toBe('unreachable');
    expect(loginFailure(new TRPCClientError('fetch failed'))).toBe('unreachable');
    expect(loginFailure(new Error('network'))).toBe('unreachable');
    expect(loginFailure(daemonError('INTERNAL'))).toBe('other');
  });

  it('wrong details: one message under the password, linked and announced politely; password cleared and focused', async () => {
    renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': list,
      'auth.login': () => Promise.reject(daemonError('AUTH_INVALID_CREDENTIALS')),
    });
    await submit('hari', 'wrong password');
    const password = screen.getByLabelText('Password');
    await waitFor(() => expect(password).toHaveAccessibleDescription('Username or password is incorrect.'));
    expect(screen.getByText('Username or password is incorrect.')).toHaveAttribute('aria-live', 'polite');
    expect(password).toHaveValue('');
    expect(password).toHaveFocus();
    expect(screen.getByLabelText('Username')).toHaveValue('hari');
  });

  it('the fifth failure goes to the locked page, keeping next', async () => {
    const { router } = renderScreen(() => <UsernameView next="/files" />, {
      'auth.listLoginUsers': list,
      'auth.login': () => Promise.reject(daemonError('AUTH_LOCKED', { until: Date.now() + 900_000 })),
    });
    await submit('hari', 'wrong password');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/locked'));
    expect(router.state.location.search).toEqual({ next: '/files' });
  });

  it("when hlabs can't be reached it says so and keeps what was typed", async () => {
    renderScreen(() => <UsernameView />, {
      'auth.listLoginUsers': list,
      'auth.login': () => Promise.reject(new Error('fetch failed')),
    });
    await submit('hari', 'my password');
    expect(await screen.findByText("Can't reach hlabs right now. Try again in a moment.")).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('hari');
    expect(screen.getByLabelText('Password')).toHaveValue('my password');
  });
});
