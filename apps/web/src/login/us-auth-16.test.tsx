import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { renderScreen } from '../test/render';
import { LogOutButton } from './log-out-button';

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-AUTH-16', () => {
  it('Log out ends the session and lands on /login, without the "logged out on this device" toast', async () => {
    const logout = vi.fn(() => ({ ok: true }));
    const { router } = renderScreen(LogOutButton, { 'auth.logout': logout }, { path: '/settings' });
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(logout).toHaveBeenCalled();
    expect(currentToasts()).toEqual([]);
  });

  it("when hlabs can't be reached it still goes to /login", async () => {
    const { router } = renderScreen(
      LogOutButton,
      { 'auth.logout': () => Promise.reject(new Error('fetch failed')) },
      { path: '/settings' },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
