import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast, pauseToast, resumeToast, showToast, TOAST_MS } from '../lib/toasts';
import { Toaster } from '../shell/toaster';
import { daemonError, renderScreen } from '../test/render';
import { CodeView } from './code-view';

const me = () => ({ username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: 'violet', csrfToken: 't' });

const Screen = () => (
  <>
    <CodeView challenge="c1" next="/files" />
    <Toaster />
  </>
);

async function useCode(code: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
  fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
}

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});
afterEach(() => vi.useRealTimers());

describe('US-AUTH-09', () => {
  it('"Use a recovery code" swaps the boxes for one field and the link for "Use my authenticator app"', async () => {
    renderScreen(Screen, {});
    fireEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
    const field = screen.getByLabelText('Recovery code');
    expect(field).toHaveAttribute('placeholder', 'xxxx-xxxx');
    expect(field).toHaveFocus();
    expect(screen.queryByLabelText('Digit 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Use my authenticator app' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });

  it('a good code logs in, goes to next and says how many are left', async () => {
    const recover = vi.fn(() => ({ redirectTo: '/files', recoveryCodesLeft: 7 }));
    const { router } = renderScreen(Screen, { 'auth.useRecoveryCode': recover, 'auth.me': me });
    await useCode('ABCD 2345');
    await waitFor(() => expect(router.state.location.pathname).toBe('/files'));
    expect(recover).toHaveBeenCalledWith({ challengeId: 'c1', code: 'ABCD 2345' });
    expect(currentToasts().at(-1)).toMatchObject({ tone: 'success', title: 'Recovery code used. You have 7 left.' });
    expect(currentToasts().at(-1)?.action).toBeUndefined();
  });

  it('with 2 or fewer left the toast says to make new codes, with a link there', async () => {
    const { router } = renderScreen(Screen, {
      'auth.useRecoveryCode': () => ({ redirectTo: '/files', recoveryCodesLeft: 2 }),
      'auth.me': me,
    });
    await useCode('abcd-2345');
    await waitFor(() => expect(router.state.location.pathname).toBe('/files'));
    expect(currentToasts().at(-1)).toMatchObject({
      tone: 'warning',
      title: 'Recovery code used. You have 2 left.',
      body: 'Make new codes in Settings › Account.',
      action: { label: 'Make new codes', to: '/settings/account/two-factor' },
    });
  });

  it('the Toaster shows the toast, its action as a link, and a Dismiss button', async () => {
    renderScreen(Toaster, {});
    showToast({
      tone: 'warning',
      title: 'Recovery code used. You have 1 left.',
      body: 'Make new codes in Settings › Account.',
      action: { label: 'Make new codes', to: '/settings/account/two-factor' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Recovery code used. You have 1 left.');
    expect(screen.getByRole('link', { name: 'Make new codes' })).toHaveAttribute(
      'href',
      '/settings/account/two-factor',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('a used or wrong code says so and keeps the field focused', async () => {
    renderScreen(Screen, { 'auth.useRecoveryCode': () => Promise.reject(daemonError('AUTH_RECOVERY_INVALID')) });
    await useCode('zzzz-zzzz');
    expect(await screen.findByText("That recovery code didn't work.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Recovery code')).toHaveFocus());
  });

  it('toasts leave on their own (success 5 s, warning 10 s), pausing while hovered or focused', () => {
    vi.useFakeTimers();
    const ok = showToast({ tone: 'success', title: 'ok' });
    const warn = showToast({ tone: 'warning', title: 'warn' });
    showToast({ tone: 'danger', title: 'stays' });
    vi.advanceTimersByTime(3000);
    pauseToast(ok);
    vi.advanceTimersByTime(2000);
    expect(currentToasts().map((t) => t.title)).toEqual(['ok', 'warn', 'stays']);
    resumeToast(ok);
    vi.advanceTimersByTime(2000);
    expect(currentToasts().map((t) => t.title)).toEqual(['warn', 'stays']);
    vi.advanceTimersByTime(5000);
    expect(currentToasts().map((t) => t.title)).toEqual(['stays']);
    expect(TOAST_MS.danger).toBeNull();
    void warn;
  });
});
