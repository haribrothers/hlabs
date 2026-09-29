import { act, renderHook } from '@testing-library/react';
import { observable, type Observer } from '@trpc/server/observable';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKOFF_MAX_MS, backoffMs, streamLink } from './stream-link';
import { reconnectNow, streamDownSince, useStreamStatus } from './stream-status';

afterEach(() => vi.useRealTimers());

type Attempt = { input: unknown; observer: Observer<unknown, unknown> };

/** Runs the link over a fake transport: every connection attempt is recorded and can be driven by the test. */
function harness(onReset = vi.fn()) {
  const attempts: Attempt[] = [];
  const received: unknown[] = [];
  const link = streamLink({ onReset, random: () => 0.5 })({} as never);
  const op = { id: 1, type: 'subscription', path: 'events.stream', input: { types: ['system.test'] }, context: {} };
  const sub = link({
    op: op as never,
    next: ((o: { input: unknown }) =>
      observable((observer) => {
        attempts.push({ input: o.input, observer: observer as never });
        return () => {};
      })) as never,
  }).subscribe({ next: (e) => received.push(e) });
  const last = () => attempts.at(-1)!;
  return {
    attempts,
    received,
    onReset,
    stop: () => sub.unsubscribe(),
    started: () => last().observer.next({ result: { type: 'started' } }),
    data: (id: string, event: unknown) => last().observer.next({ result: { type: 'data', id, data: event } }),
    drop: () => last().observer.error(new Error('stream closed')),
  };
}

describe('US-STATE-18', () => {
  it('backs off 1, 2, 4, 8, 16 s, then every 30 s, each within 20% jitter', () => {
    expect([1, 2, 3, 4, 5, 6, 12].map((n) => backoffMs(n, () => 0.5))).toEqual([
      1_000,
      2_000,
      4_000,
      8_000,
      16_000,
      BACKOFF_MAX_MS,
      BACKOFF_MAX_MS,
    ]);
    expect(backoffMs(1, () => 0)).toBe(800);
    expect(backoffMs(1, () => 1)).toBe(1_200);
    for (let i = 0; i < 50; i++) {
      const ms = backoffMs(6);
      expect(ms).toBeGreaterThanOrEqual(24_000);
      expect(ms).toBeLessThanOrEqual(36_000);
    }
  });

  it('reconnects on that schedule, sends the last event id, and starts the backoff over once connected', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.started();
    h.data('boot-7', { type: 'system.test', at: 1, data: { message: 'hi' } });
    expect(h.received).toHaveLength(2);

    h.drop();
    expect(streamDownSince()).not.toBeNull();
    for (const [n, wait] of [
      [2, 1_000],
      [3, 2_000],
      [4, 4_000],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(h.attempts).toHaveLength(n - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.attempts).toHaveLength(n);
      expect(h.attempts.at(-1)!.input).toEqual({ types: ['system.test'], lastEventId: 'boot-7' });
      if (n < 4) h.drop();
    }
    h.started();
    expect(streamDownSince()).toBeNull();
    // A later drop starts again at 1 s.
    h.drop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.attempts).toHaveLength(5);
    h.stop();
  });

  it('when the daemon cannot resume (stream.reset) every query is refetched, and the marker is not passed on', () => {
    const h = harness();
    h.started();
    h.data('boot2-0', { type: 'stream.reset', at: 1, data: {} });
    expect(h.onReset).toHaveBeenCalledOnce();
    expect(h.received).toHaveLength(1);
    h.stop();
  });

  it('a visible tab again reconnects at once instead of waiting', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.started();
    h.drop();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(BACKOFF_MAX_MS);
      h.drop();
    }
    const before = h.attempts.length;
    reconnectNow();
    expect(h.attempts).toHaveLength(before + 1);
    h.stop();
    expect(streamDownSince()).toBeNull();
  });

  it('"reconnecting" once the stream has been down for 5 s', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.started();
    const { result } = renderHook(() => useStreamStatus());
    expect(result.current).toBe('connected');
    act(() => h.drop());
    // Reconnect attempts keep failing.
    const failing = setInterval(() => h.drop(), 500);
    await act(async () => vi.advanceTimersByTime(4_999));
    expect(result.current).toBe('connected');
    await act(async () => vi.advanceTimersByTime(1));
    expect(result.current).toBe('reconnecting');
    clearInterval(failing);
    // The next attempt connects.
    await act(async () => vi.advanceTimersByTime(BACKOFF_MAX_MS * 1.2));
    act(() => h.started());
    expect(result.current).toBe('connected');
    h.stop();
  });
});
