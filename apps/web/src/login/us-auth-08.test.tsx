import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { CodeView } from './code-view';
import { PasswordView } from './password-view';

const me = () => ({ username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: 'violet', csrfToken: 't' });

const type = (code: string) => {
  for (let i = 0; i < code.length; i++)
    fireEvent.change(screen.getByLabelText(`Digit ${i + 1}`), { target: { value: code[i] } });
};

describe('US-AUTH-08', () => {
  it('first box focused; Verify only with 6 digits; the sixth digit submits and goes to next', async () => {
    const verify = vi.fn(() => ({ redirectTo: '/files' }));
    const { router } = renderScreen(() => <CodeView challenge="c1" next="/files" />, {
      'auth.verifyTotp': verify,
      'auth.me': me,
    });
    expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    expect(screen.getByLabelText('Digit 1')).toHaveFocus();
    type('12345');
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
    type('123456');
    await waitFor(() => expect(router.state.location.pathname).toBe('/files'));
    expect(verify).toHaveBeenCalledWith({ challengeId: 'c1', code: '123456' });
  });

  it('a wrong code says what to check, clears the boxes and focuses the first', async () => {
    renderScreen(() => <CodeView challenge="c1" />, {
      'auth.verifyTotp': () => Promise.reject(daemonError('AUTH_TOTP_INVALID')),
    });
    await screen.findByLabelText('Digit 1');
    type('123456');
    expect(
      await screen.findByText("That code didn't work. Check the time on your phone and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Digit 6')).toHaveValue('');
    await waitFor(() => expect(screen.getByLabelText('Digit 1')).toHaveFocus());
  });

  it('too many wrong codes go to the locked page', async () => {
    const { router } = renderScreen(() => <CodeView challenge="c1" next="/files" />, {
      'auth.verifyTotp': () => Promise.reject(daemonError('AUTH_LOCKED', { until: Date.now() + 900_000 })),
    });
    await screen.findByLabelText('Digit 1');
    type('123456');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/locked'));
    expect(router.state.location.search).toEqual({ next: '/files' });
  });

  it('a timed-out code step goes back to the password screen, keeping next, with a message there', async () => {
    const { router } = renderScreen(() => <CodeView challenge="c1" next="/files" user="hari" />, {
      'auth.verifyTotp': () => Promise.reject(daemonError('AUTH_CHALLENGE_EXPIRED')),
    });
    await screen.findByLabelText('Digit 1');
    type('123456');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/password'));
    expect(router.state.location.search).toEqual({ user: 'hari', next: '/files', reason: 'timeout' });

    renderScreen(() => <PasswordView username="hari" reason="timeout" />, {
      'auth.listLoginUsers': () => ({
        users: [{ id: '1', username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: 'violet' }],
      }),
    });
    expect(await screen.findByText('Your login timed out. Enter your password again.')).toBeInTheDocument();
  });

  it('Back returns to the password screen; without a remembered account, the username form', async () => {
    const { router } = renderScreen(() => <CodeView challenge="c1" next="/files" />, {});
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/username'));
    expect(router.state.location.search).toEqual({ next: '/files' });
  });

  it("when the secret can't be read, points to a recovery code; the recovery field swaps in", async () => {
    renderScreen(() => <CodeView challenge="c1" />, {
      'auth.verifyTotp': () => Promise.reject(daemonError('AUTH_SECRET_UNAVAILABLE')),
    });
    await screen.findByLabelText('Digit 1');
    type('123456');
    expect(
      await screen.findByText("hlabs can't check codes right now. Use a recovery code or ask your admin."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }));
    expect(screen.getByLabelText('Recovery code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Digit 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use my authenticator app' }));
    expect(screen.getByLabelText('Digit 1')).toBeInTheDocument();
  });
});
