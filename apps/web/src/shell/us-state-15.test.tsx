import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionsFromNotification, visibleActions } from '../lib/toast-actions';
import { currentToasts, dismissToast, showToast, type ToastAction } from '../lib/toasts';
import { daemonError, renderScreen } from '../test/render';
import { Toaster } from './toaster';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

const me = (role: 'admin' | 'member') => () => ({ id: 'u1', username: 'hari', displayName: 'Hari', role });

const kumaActions = actionsFromNotification([
  { kind: 'navigate', to: '/apps/uptime-kuma/logs' },
  { kind: 'mutation', procedure: 'apps.start', input: { appId: 'uptime-kuma' }, label: 'Retry' },
]);

function kumaToast(actions: ToastAction[] = kumaActions) {
  act(() => {
    showToast({
      tone: 'danger',
      title: "Uptime Kuma couldn't start",
      body: 'Port 3001 is already in use by another program.',
      actions,
    });
  });
}

describe('US-STATE-15', () => {
  it('notification buttons: verb-first labels from where they go, allow-listed mutations only', () => {
    expect(kumaActions).toEqual([
      { kind: 'navigate', to: '/apps/uptime-kuma/logs', label: 'View logs', admin: true, feature: 'apps' },
      { kind: 'mutation', procedure: 'apps.start', input: { appId: 'uptime-kuma' }, label: 'Retry' },
    ]);
    expect(actionsFromNotification([{ kind: 'navigate', to: '/settings/storage' }])).toEqual([
      { kind: 'navigate', to: '/settings/storage', label: 'Manage storage', admin: true, feature: 'storageSettings' },
    ]);
    expect(
      actionsFromNotification([
        { kind: 'mutation', procedure: 'users.delete' as never, input: { userId: 'u2' }, label: 'Delete' },
      ]),
    ).toEqual([]);
  });

  it('at most two; View logs waits for phase 2 and Manage storage for phase 7; members get none needing an admin', () => {
    const three: ToastAction[] = [...kumaActions, { kind: 'navigate', to: '/', label: 'Go home' }];
    expect(visibleActions(three, { isAdmin: true, shippedPhase: 2 }).map((a) => a.label)).toEqual([
      'View logs',
      'Retry',
    ]);
    expect(visibleActions(kumaActions, { isAdmin: true, shippedPhase: 1 }).map((a) => a.label)).toEqual(['Retry']);
    const storage = actionsFromNotification([{ kind: 'navigate', to: '/settings/storage' }]);
    expect(visibleActions(storage, { isAdmin: true, shippedPhase: 6 })).toEqual([]);
    expect(visibleActions(storage, { isAdmin: true, shippedPhase: 7 })).toHaveLength(1);
    expect(visibleActions(three, { isAdmin: false, shippedPhase: 9 }).map((a) => a.label)).toEqual(['Go home']);
  });

  it('a member sees only the text and Dismiss', async () => {
    renderScreen(Toaster, { 'auth.me': me('member') });
    kumaToast();
    const toast = await screen.findByRole('alert');
    await waitFor(() => expect(within(toast).getAllByRole('button')).toHaveLength(1));
    expect(within(toast).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('a navigate button goes there and dismisses the toast', async () => {
    const { router } = renderScreen(Toaster, { 'auth.me': me('admin') });
    kumaToast([{ kind: 'navigate', to: '/settings/account', label: 'Open settings' }]);
    fireEvent.click(await screen.findByRole('link', { name: 'Open settings' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/account'));
    await waitFor(() => expect(currentToasts()).toEqual([]));
  });

  it('Retry runs the action with a spinner; success replaces the toast, failure keeps it with new copy', async () => {
    let attempt = 0;
    const start = vi.fn(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(daemonError('JOB_EXCLUSIVE_RUNNING'));
      return new Promise((r) => setTimeout(() => r({ ok: true }), 20));
    });
    renderScreen(Toaster, { 'auth.me': me('admin'), 'apps.start': start });
    kumaToast();
    const toast = await screen.findByRole('alert');
    const retry = await within(toast).findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    await waitFor(() =>
      expect(toast).toHaveTextContent('hlabs is busy with something that must finish first. Try again when it’s done.'),
    );
    expect(toast).toHaveTextContent("Uptime Kuma couldn't start");
    expect(retry).toBeEnabled();

    fireEvent.click(retry);
    expect(retry).toHaveAttribute('aria-busy', 'true');
    expect(start).toHaveBeenLastCalledWith({ appId: 'uptime-kuma' });
    expect(await screen.findByRole('status')).toHaveTextContent('App started');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
