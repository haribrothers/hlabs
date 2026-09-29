import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import { daemonError, renderScreen } from '../test/render';
import { SignedInDevices } from './signed-in-devices';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let items: Array<Record<string, unknown>> = [];
const list = () => ({ items });

beforeEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
  const now = Date.now();
  items = [
    { id: 'me', current: true, userAgent: null, ip: '127.0.0.1', createdAt: 0, lastSeenAt: now },
    { id: 'phone', current: false, userAgent: IPHONE, ip: '100.64.0.2', createdAt: 0, lastSeenAt: now },
  ];
});

describe('US-ACCT-05', () => {
  it('Sign out ends that session, removes the row and says "Signed out <device>"', async () => {
    const revoke = vi.fn(({ sessionId }: { sessionId: string }) => {
      items = items.filter((i) => i.id !== sessionId);
      return { ok: true };
    });
    renderScreen(SignedInDevices, { 'auth.listSessions': list, 'auth.revokeSession': revoke as never });
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out iPhone' }));
    await waitFor(() => expect(screen.queryByText('iPhone · Safari')).toBeNull());
    expect(revoke).toHaveBeenCalledWith({ sessionId: 'phone' });
    expect(currentToasts().map((t) => [t.tone, t.title])).toEqual([['success', 'Signed out iPhone']]);
    // This device has no Sign out button.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('a failed sign-out keeps the row and shows an error toast', async () => {
    renderScreen(SignedInDevices, {
      'auth.listSessions': list,
      'auth.revokeSession': () => Promise.reject(daemonError('INTERNAL')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out iPhone' }));
    await waitFor(() => expect(currentToasts()).toHaveLength(1));
    expect(currentToasts()[0]).toMatchObject({ tone: 'danger', title: "Couldn't sign out iPhone. Try again." });
    expect(screen.getByText('iPhone · Safari')).toBeInTheDocument();
  });
});
