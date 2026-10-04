// US-STATE-03 · Handle a failed or stuck update.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastFromNotification } from '../lib/notification-feed';
import { TOAST_MS, SEVERITY_TONE } from '../lib/toasts';
import { visibleActions } from '../lib/toast-actions';
import type { HealthCheck } from './daemon-down';
import { HealthGate } from './health-gate';
import { clearUpdating, markUpdating, STUCK_AFTER_MS, UPDATE_POLL_MS, updatingNow } from './updating';

const down: HealthCheck = { ok: false, reason: null };

function gate(check: () => Promise<HealthCheck>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HealthGate check={check} confirmVersion={async () => null} reload={() => {}}>
        <p>dashboard</p>
      </HealthGate>
    </QueryClientProvider>,
  );
}

describe('US-STATE-03', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearUpdating();
  });
  afterEach(() => vi.useRealTimers());

  it('10 minutes of updating without hlabs back: "Can\'t reach hlabs", the update is taking longer than expected', async () => {
    vi.useFakeTimers();
    gate(async () => down);
    act(() => markUpdating());
    await act(async () => vi.advanceTimersByTime(STUCK_AFTER_MS - UPDATE_POLL_MS));
    expect(screen.getByRole('heading', { name: 'Updating hlabs' })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(UPDATE_POLL_MS * 2));
    expect(screen.getByRole('heading', { name: "Can't reach hlabs" })).toBeInTheDocument();
    expect(screen.getByText(/The update is taking longer than expected/)).toBeInTheDocument();
    expect(updatingNow()).toBeNull();
  });

  it('migrations that failed: "Can\'t reach hlabs" with that reason at once', async () => {
    vi.useFakeTimers();
    gate(async () => ({ ok: false, reason: 'migration_failed' }));
    act(() => markUpdating());
    await act(async () => vi.advanceTimersByTime(0));
    expect(screen.getByRole('heading', { name: "Can't reach hlabs" })).toBeInTheDocument();
    expect(screen.getByText(/hlabs couldn't update its database/)).toBeInTheDocument();
  });

  it('rolled back: the admins\' critical notification is a danger toast that stays, with "View details"', () => {
    const toast = toastFromNotification({
      notificationId: 'n1',
      userId: null,
      kind: 'system.update_failed',
      target: null,
      severity: 'critical',
      title: "The update didn't install",
      body: "hlabs is still on 1.4.0; 1.5.0 didn't start, so nothing changed.",
      actions: [{ kind: 'navigate', to: '/settings/updates' }],
      createdAt: 1,
    } as never);
    expect(toast.tone).toBe(SEVERITY_TONE.critical);
    expect(TOAST_MS[toast.tone]).toBeNull();
    expect(toast.actions).toEqual([
      { kind: 'navigate', to: '/settings/updates', label: 'View details', admin: true, feature: 'hlabsUpdates' },
    ]);
    // A member never gets it (it's for admins), nor its button.
    expect(visibleActions(toast.actions, { isAdmin: false, shippedPhase: 4 })).toEqual([]);
  });
});
