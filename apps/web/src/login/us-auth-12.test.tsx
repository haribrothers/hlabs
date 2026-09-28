import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { formatCountdown, LockedView } from './locked-view';
import { writeRememberedUser, readRememberedUser } from './remembered';
import { UsernameView } from './username-view';

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const noList = () => ({ users: [] });

describe('US-AUTH-12', () => {
  it('formats the countdown as m:ss', () => {
    expect(formatCountdown(299_001)).toBe('5:00');
    expect(formatCountdown(299_000)).toBe('4:59');
    expect(formatCountdown(9_000)).toBe('0:09');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('the fifth failure opens the locked page for that username, with the time the server gave', async () => {
    const { router } = renderScreen(() => <UsernameView next="/files" />, {
      'auth.listLoginUsers': noList,
      'auth.login': () => Promise.reject(daemonError('AUTH_LOCKED', { retryAfterSeconds: 900 })),
    });
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: ' Hari ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    const before = Date.now();
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/locked'));
    const search = router.state.location.search as { user: string; until: number; next: string };
    expect(search).toMatchObject({ user: 'hari', next: '/files' });
    expect(search.until - before).toBeGreaterThanOrEqual(900_000);
    expect(search.until - Date.now()).toBeLessThanOrEqual(900_000);
  });

  it('shows who is paused and counts down every second; Try again waits for 0:00, then goes to the password screen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const until = Date.now() + 3000;
    const { router } = renderScreen(() => <LockedView user="hari" until={until} next="/files" />, {
      'auth.listLoginUsers': noList,
    });
    expect(await screen.findByRole('heading', { name: 'Too many attempts' })).toHaveFocus();
    expect(screen.getByText('@hari')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('0:03');
    const button = screen.getByRole('button', { name: 'Try again in 0:03' });
    expect(button).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('timer')).toHaveTextContent('0:02');
    await act(async () => vi.advanceTimersByTime(2500));
    expect(screen.queryByRole('timer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/password'));
    expect(router.state.location.search).toEqual({ user: 'hari', next: '/files' });
  });

  it('Use another account forgets the remembered account and opens the list, or the form when hidden', async () => {
    writeRememberedUser({ username: 'hari', displayName: 'Hari', role: 'admin', avatarColor: null });
    const { router } = renderScreen(() => <LockedView user="hari" until={Date.now() + 60_000} />, {
      'auth.listLoginUsers': noList,
    });
    fireEvent.click(await screen.findByRole('link', { name: 'Use another account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login/username'));
    expect(readRememberedUser()).toBeNull();
  });
});
