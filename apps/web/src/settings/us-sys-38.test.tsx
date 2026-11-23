// US-SYS-38 · Reset hlabs: while the reset runs every route gives way to a full-screen "Resetting hlabs…" with its
// step (from /healthz, which needs no session); once hlabs answers again, the browser opens setup (OnbWelcome) with the
// setup token the reset gave it. Its own sign-out (every session ends) doesn't send it to log in.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthCheck } from '../health/daemon-down';
import { HealthGate } from '../health/health-gate';
import { clearRestarting, markResetting, resetUnderway, restartingNow, setResetAsked } from '../health/restarting';

beforeEach(() => {
  sessionStorage.clear();
  clearRestarting();
});
afterEach(() => vi.useRealTimers());

function gate(check: () => Promise<HealthCheck>) {
  const go = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HealthGate check={check} go={go}>
        <p>dashboard</p>
      </HealthGate>
    </QueryClientProvider>,
  );
  return go;
}

describe('US-SYS-38', () => {
  it('"Resetting hlabs…" shows each step, then setup opens with the setup token', async () => {
    vi.useFakeTimers();
    markResetting('tok-123');
    let answer: HealthCheck = { ok: false, reason: 'resetting', step: 2, steps: 4, stepLabel: 'Deleting data' };
    const go = gate(async () => answer);
    await act(async () => vi.advanceTimersByTime(10));
    expect(screen.queryByText('dashboard')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Resetting hlabs…' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 4 · Deleting data')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Resetting hlabs…' })).toHaveAttribute('aria-valuenow', '25');
    // Down while it starts again, then back, empty.
    answer = { ok: false, reason: null, noAnswer: true };
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(go).not.toHaveBeenCalled();
    answer = { ok: true, reason: null, version: '0.7.0' };
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(go).toHaveBeenCalledWith('/setup?token=tok-123');
    expect(restartingNow()).toBeNull();
  });

  it('other pages see the reset from /healthz, and go Home (finish setup on the computer) after it', async () => {
    vi.useFakeTimers();
    let answer: HealthCheck = { ok: false, reason: 'resetting', step: 1, steps: 4, stepLabel: 'Stopping apps' };
    const go = gate(async () => answer);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole('heading', { level: 1, name: 'Resetting hlabs…' })).toBeInTheDocument();
    answer = { ok: true, reason: null };
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(go).toHaveBeenCalledWith('/');
  });

  it("the reset's own end of every session isn't a reason to go to log in", () => {
    expect(resetUnderway()).toBe(false);
    setResetAsked(true);
    expect(resetUnderway()).toBe(true);
    setResetAsked(false);
    markResetting(null);
    expect(resetUnderway()).toBe(true);
  });
});
