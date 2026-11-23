// US-PHONE-06 · Two-factor, lockout and forgot password on a phone: the code step full-screen with a numeric,
// one-time-code field that submits itself (a pasted "123 456" too) and the recovery code; the 15-minute lockout
// counting down; ForgotPassword as a page with its way back to log in.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { phoneViewport } from '../test/phone';
import { renderScreen } from '../test/render';
import { CodeView } from './code-view';
import { ForgotView } from './forgot-view';
import { LockedView } from './locked-view';

const me = () => ({ username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: 'violet', csrfToken: 't' });

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  restore();
  vi.useRealTimers();
});

describe('US-PHONE-06', () => {
  it('the code step is the whole page, with a numeric field the phone can fill with the code', async () => {
    renderScreen(() => <CodeView challenge="c1" />, {});
    expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    const first = screen.getByLabelText('Digit 1');
    expect(first).toHaveAttribute('inputmode', 'numeric');
    expect(first).toHaveAttribute('autocomplete', 'one-time-code');
    expect(first.closest('.hl-login-phone')).not.toBeNull();
    // "‹ Back" at the top (PhoneRedesignA_Login2FA) and the line about checking at the sixth digit.
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('hl-p-back');
    expect(screen.getByText('We check it as soon as you type the sixth digit.')).toBeInTheDocument();
  });

  it('a pasted "123 456" is taken and sent at once', async () => {
    const verify = vi.fn(() => ({ redirectTo: '/' }));
    const { router } = renderScreen(() => <CodeView challenge="c1" next="/files" />, {
      'auth.verifyTotp': verify,
      'auth.me': me,
    });
    const first = await screen.findByLabelText('Digit 1');
    fireEvent.paste(first, { clipboardData: { getData: () => '123 456' } });
    await waitFor(() => expect(verify).toHaveBeenCalledWith({ challengeId: 'c1', code: '123456' }));
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/login/code'));
  });

  it('"Use a recovery code" works as on the desktop', async () => {
    renderScreen(() => <CodeView challenge="c1" />, {});
    fireEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
    expect(screen.getByLabelText('Recovery code')).toHaveFocus();
  });

  it('a locked log-in counts down the time left, full-screen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderScreen(() => <LockedView user="hari" until={Date.now() + 15 * 60_000} />, {
      'auth.listLoginUsers': () => ({ users: [] }),
    });
    expect(await screen.findByRole('heading', { name: 'Too many attempts' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('15:00');
    await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('timer')).toHaveTextContent('14:59');
    // "‹ Back", another account and the reset (PhoneRedesignA_LoginLocked).
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/login/password?user=hari');
    expect(screen.getByRole('link', { name: 'Use another account' })).toHaveClass('hl-p-secondary');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeInTheDocument();
  });

  it('Forgot password? is a full-screen page with "‹ Log in" and the same words, no email', async () => {
    const { router } = renderScreen(() => <ForgotView from="username" />, {});
    expect(await screen.findByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.getByText("hlabs doesn't use email, so resets happen at home.")).toBeInTheDocument();
    const ways = screen.getByRole('list', { name: 'Ways to reset a password' });
    expect(
      within(ways)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Ask your admin', 'Admin on a Mac or Linux desktop', 'Admin on a Linux server']);
    // No recovery-code way: those replace two-factor only (D-009).
    expect(screen.queryByText(/recovery code/i)).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Log in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/username'));
  });
});
