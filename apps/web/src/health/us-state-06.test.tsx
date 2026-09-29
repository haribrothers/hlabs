import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DaemonDownController, type HealthCheck, type Visibility } from './daemon-down';
import { DaemonDownView } from './daemon-down-view';

afterEach(() => vi.useRealTimers());

function fakeVisibility() {
  let hidden = false;
  const listeners = new Set<() => void>();
  const visibility: Visibility = {
    hidden: () => hidden,
    onChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return {
    visibility,
    set(next: boolean) {
      hidden = next;
      for (const l of listeners) l();
    },
  };
}

const down: HealthCheck = { ok: false, reason: 'daemon_unreachable' };

describe('US-STATE-06', () => {
  it('counts down 5, 4, 3, 2, 1 once a second, then reads "Trying again…" while the check is in flight', async () => {
    vi.useFakeTimers();
    let settle: (r: HealthCheck) => void = () => {};
    const check = vi.fn(() => new Promise<HealthCheck>((r) => (settle = r)));
    const controller = new DaemonDownController({ check, onBack: () => {}, visibility: fakeVisibility().visibility });
    render(<DaemonDownView controller={controller} checkAtOnce={false} />);
    for (const n of [5, 4, 3, 2]) {
      expect(screen.getByText(`Trying again in ${n} seconds…`)).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(1_000));
    }
    expect(screen.getByText('Trying again in 1 second…')).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(check).toHaveBeenCalledOnce();
    expect(screen.getByText('Trying again…')).toBeInTheDocument();
    // The countdown isn't announced: only the reason line is live.
    expect(screen.getByText('Trying again…').closest('[aria-live]')).toBeNull();
    await act(async () => settle(down));
    expect(screen.getByText('Trying again in 5 seconds…')).toBeInTheDocument();
  });

  it('Try now checks at once, is busy and disabled until it settles, then restarts the countdown at 5', async () => {
    vi.useFakeTimers();
    let settle: (r: HealthCheck) => void = () => {};
    const check = vi.fn(() => new Promise<HealthCheck>((r) => (settle = r)));
    const controller = new DaemonDownController({ check, onBack: () => {}, visibility: fakeVisibility().visibility });
    render(<DaemonDownView controller={controller} checkAtOnce={false} />);
    await act(async () => vi.advanceTimersByTime(3_000));
    expect(screen.getByText('Trying again in 2 seconds…')).toBeInTheDocument();

    // First focusable element, so Tab then Enter/Space reaches it straight away.
    const button = screen.getByRole('button', { name: 'Try now' });
    const focusables = document.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])');
    expect(focusables[0]).toBe(button);

    fireEvent.click(button);
    expect(check).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    // No second check while one is in flight, and no ticking.
    fireEvent.click(button);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(check).toHaveBeenCalledOnce();

    await act(async () => settle(down));
    expect(button).toBeEnabled();
    expect(screen.getByText('Trying again in 5 seconds…')).toBeInTheDocument();
  });

  it('once hlabs answers it calls back straight away and stops checking', async () => {
    vi.useFakeTimers();
    let answer: HealthCheck = down;
    const check = vi.fn(async () => answer);
    const onBack = vi.fn();
    const controller = new DaemonDownController({ check, onBack, visibility: fakeVisibility().visibility });
    controller.start();
    await act(async () => vi.advanceTimersByTime(5_000));
    answer = { ok: true, reason: null };
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(onBack).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('checks every 30 s while the tab is hidden, and at once when it is shown again', async () => {
    vi.useFakeTimers();
    const vis = fakeVisibility();
    const check = vi.fn(async () => down);
    const controller = new DaemonDownController({ check, onBack: () => {}, visibility: vis.visibility });
    controller.start();
    await act(async () => vis.set(true));
    expect(controller.snapshot.secondsLeft).toBe(30);
    await act(async () => vi.advanceTimersByTime(29_000));
    expect(check).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(check).toHaveBeenCalledOnce();
    // Still hidden: the next wait is 30 s again.
    expect(controller.snapshot.secondsLeft).toBe(30);

    await act(async () => vis.set(false));
    expect(check).toHaveBeenCalledTimes(2);
    expect(controller.snapshot.secondsLeft).toBe(5);
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(check).toHaveBeenCalledTimes(3);
    controller.stop();
  });

  it('a check from before a restart is ignored (StrictMode runs effects twice)', async () => {
    vi.useFakeTimers();
    const onBack = vi.fn();
    let first = true;
    let settleFirst: (r: HealthCheck) => void = () => {};
    const check = vi.fn(() => {
      if (!first) return Promise.resolve(down);
      first = false;
      return new Promise<HealthCheck>((r) => (settleFirst = r));
    });
    const controller = new DaemonDownController({ check, onBack, visibility: fakeVisibility().visibility });
    controller.start({ now: true });
    controller.stop();
    controller.start({ now: true });
    await act(async () => settleFirst({ ok: true, reason: null }));
    expect(onBack).not.toHaveBeenCalled();
    controller.stop();
  });
});
