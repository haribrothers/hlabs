// US-STATE-02 · Reconnect automatically when the update finishes.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentToasts, dismissToast } from '../lib/toasts';
import type { HealthCheck } from './daemon-down';
import { HealthGate } from './health-gate';
import { clearUpdating, markUpdating, noteVersion, RESULT_KEY, UPDATE_POLL_MS, updatingNow } from './updating';

const down: HealthCheck = { ok: false, reason: null };

function gate(props: {
  check: () => Promise<HealthCheck>;
  confirmVersion?: () => Promise<string | null>;
  reload?: () => void;
}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HealthGate {...props}>
        <p>dashboard</p>
      </HealthGate>
    </QueryClientProvider>,
  );
}

describe('US-STATE-02', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearUpdating();
    for (const t of currentToasts()) dismissToast(t.id);
  });
  afterEach(() => vi.useRealTimers());

  it('while updating, /healthz is asked every 2 seconds', async () => {
    vi.useFakeTimers();
    const check = vi.fn(async () => down);
    gate({ check });
    act(() => markUpdating());
    const before = check.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(UPDATE_POLL_MS * 3));
    expect(check.mock.calls.length - before).toBeGreaterThanOrEqual(3);
  });

  it('a 200 confirmed by system.health reloads the page at once, remembering which versions', async () => {
    vi.useFakeTimers();
    noteVersion('1.4.0');
    let answer: HealthCheck = down;
    const reload = vi.fn();
    gate({ check: async () => answer, confirmVersion: async () => '1.5.0', reload });
    act(() => markUpdating());
    answer = { ok: true, reason: null, version: '1.5.0' };
    await act(async () => vi.advanceTimersByTime(UPDATE_POLL_MS));
    expect(reload).toHaveBeenCalledOnce();
    expect(updatingNow()).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(RESULT_KEY)!)).toEqual({ from: '1.4.0', to: '1.5.0' });
  });

  it("a 200 that system.health doesn't confirm (it flapped) doesn't reload yet", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    gate({ check: async () => ({ ok: true, reason: null }), confirmVersion: async () => null, reload });
    act(() => markUpdating());
    await act(async () => vi.advanceTimersByTime(UPDATE_POLL_MS * 2));
    expect(reload).not.toHaveBeenCalled();
    expect(updatingNow()).not.toBeNull();
  });

  it('after the reload: "hlabs is up to date" with the new version, once per browser session', async () => {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify({ from: '1.4.0', to: '1.5.0' }));
    const first = gate({ check: async () => ({ ok: true, reason: null }) });
    expect(currentToasts().map((t) => [t.tone, t.title, t.body])).toEqual([
      ['success', 'hlabs is up to date', 'Version 1.5.0'],
    ]);
    first.unmount();
    for (const t of currentToasts()) dismissToast(t.id);
    sessionStorage.setItem(RESULT_KEY, JSON.stringify({ from: '1.4.0', to: '1.5.0' }));
    gate({ check: async () => ({ ok: true, reason: null }) });
    expect(currentToasts()).toEqual([]);
  });
});
