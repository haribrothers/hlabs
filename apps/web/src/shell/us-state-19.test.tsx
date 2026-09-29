import type { AppRouter } from '@hlabs/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { createTRPCClient, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionProblem } from '../lib/connection';
import { errorLine } from '../lib/error-copy';
import { offlineLink } from '../lib/offline-link';
import { markStreamDown, markStreamUp } from '../lib/stream-status';
import { currentToasts, dismissToast } from '../lib/toasts';
import { HealthGate } from '../health/health-gate';
import { ConnectionBanner } from './connection-banner';

let online = true;
vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);

function goOnline(value: boolean) {
  online = value;
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

afterEach(() => {
  act(() => goOnline(true));
  markStreamUp(999);
  for (const t of currentToasts()) dismissToast(t.id);
  vi.useRealTimers();
});

function renderBanner() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <ConnectionBanner />
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe('US-STATE-19', () => {
  it('"You\'re offline" as soon as the browser says so; back online it goes and every query refetches', () => {
    const { invalidate } = renderBanner();
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    act(() => goOnline(false));
    expect(status).toHaveTextContent("You're offline");
    act(() => goOnline(true));
    expect(status).toBeEmptyDOMElement();
    expect(invalidate).toHaveBeenCalledOnce();
    // No "you're back" toast.
    expect(currentToasts()).toEqual([]);
  });

  it('online but the stream down for 5 s: "Reconnecting…"; offline wins over it', async () => {
    vi.useFakeTimers();
    renderBanner();
    const status = screen.getByRole('status');
    act(() => markStreamDown(999));
    await act(async () => vi.advanceTimersByTime(4_999));
    expect(status).toBeEmptyDOMElement();
    await act(async () => vi.advanceTimersByTime(1));
    expect(status).toHaveTextContent('Reconnecting…');
    act(() => goOnline(false));
    expect(status).toHaveTextContent("You're offline");
    expect(status).not.toHaveTextContent('Reconnecting…');
    act(() => goOnline(true));
    act(() => markStreamUp(999));
    expect(status).toBeEmptyDOMElement();
  });

  it('while offline, mutations fail at once with a warning toast and never reach the daemon; reads go through', async () => {
    const sent: string[] = [];
    const transport: TRPCLink<AppRouter> =
      () =>
      ({ op }) =>
        observable((observer) => {
          sent.push(op.path);
          observer.next({ result: { type: 'data', data: { ok: true } } } as never);
          observer.complete();
        });
    const client = createTRPCClient<AppRouter>({ links: [offlineLink(), transport] });
    goOnline(false);
    expect(connectionProblem()).toBe('offline');
    const err = await client.apps.start.mutate({ appId: 'immich' }).catch((e: unknown) => e);
    expect(sent).toEqual([]);
    expect(errorLine(err)).toBe("Can't reach hlabs. Check your connection and try again.");
    expect(currentToasts().at(-1)).toMatchObject({
      tone: 'warning',
      title: "You're offline. Try again when you're connected.",
    });
    await client.auth.me.query();
    expect(sent).toEqual(['auth.me']);
    goOnline(true);
    await client.apps.start.mutate({ appId: 'immich' });
    expect(sent).toEqual(['auth.me', 'apps.start']);
  });

  it('offline, the page stays under the banner instead of switching to "Can\'t reach hlabs"', async () => {
    vi.useFakeTimers();
    const check = vi.fn(async () => ({ ok: false, reason: 'daemon_unreachable' }));
    goOnline(false);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HealthGate check={check}>
          <p>Your apps</p>
        </HealthGate>
      </QueryClientProvider>,
    );
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('Your apps')).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
  });
});
