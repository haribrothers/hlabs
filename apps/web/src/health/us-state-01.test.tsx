// US-STATE-01 · Show a full-screen updating state.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthCheck } from './daemon-down';
import { HealthGate } from './health-gate';
import { clearUpdating, markUpdating, reloadUpdatingFlag, UPDATING_KEY } from './updating';

const down: HealthCheck = { ok: false, reason: null };
const updatingAt = (step: number, stepLabel: string): HealthCheck => ({
  ok: false,
  reason: 'updating',
  step,
  steps: 4,
  stepLabel,
});

function gate(check: () => Promise<HealthCheck>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HealthGate check={check}>
        <p>dashboard</p>
      </HealthGate>
    </QueryClientProvider>,
  );
}

describe('US-STATE-01', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearUpdating();
  });
  afterEach(() => vi.useRealTimers());

  it('/healthz saying "updating" replaces every route with "Updating hlabs" and its step', async () => {
    vi.useFakeTimers();
    gate(async () => updatingAt(2, 'Restarting apps'));
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(screen.queryByText('dashboard')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Updating hlabs' })).toBeInTheDocument();
    expect(document.title).toBe('Updating hlabs');
    await act(async () => vi.advanceTimersByTime(0));
    expect(screen.getByText('Step 2 of 4 · Restarting apps')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Updating hlabs' });
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-valuetext', 'Step 2 of 4 · Restarting apps');
    expect(screen.getByText('This page reloads by itself when the update finishes.')).toBeInTheDocument();
  });

  it('the system.status event shows it at once; while nothing answers it stays on step 1, not "Can\'t reach hlabs"', async () => {
    vi.useFakeTimers();
    gate(async () => down);
    act(() => markUpdating());
    expect(screen.getByRole('heading', { name: 'Updating hlabs' })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Step 1 of 4 · Installing update')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "Can't reach hlabs" })).toBeNull();
  });

  it('a refresh while hlabs is down still shows it (sessionStorage); "Go to Home" reloads at /', async () => {
    sessionStorage.setItem(UPDATING_KEY, JSON.stringify({ since: Date.now() }));
    reloadUpdatingFlag();
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign } as Location);
    gate(async () => down);
    expect(screen.getByRole('heading', { name: 'Updating hlabs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Home' }));
    expect(assign).toHaveBeenCalledWith('/');
    vi.restoreAllMocks();
  });

  it('marking it keeps the flag for the next load; it needs no session', () => {
    markUpdating(1234);
    expect(JSON.parse(sessionStorage.getItem(UPDATING_KEY)!)).toEqual({ since: 1234 });
    clearUpdating();
    expect(sessionStorage.getItem(UPDATING_KEY)).toBeNull();
  });
});
