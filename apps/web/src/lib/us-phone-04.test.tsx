// US-PHONE-04 · Back navigation and resuming after the phone sleeps: Back closes a panel opened over the page; the
// app details' back control is the browser's Back, or the store after a deep link; coming back to the tab reconnects
// the event stream at once (even one that looks connected) and refetches what's on screen, and so does iOS's
// back-forward cache. A session that ended meanwhile then goes to log in with `next` (US-AUTH-14's handler, through
// the refetch); the 10 s "Can't reach hlabs" is US-STATE-04's, full-screen on a phone (e2e).
import { QueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { observable, type Observer } from '@trpc/server/observable';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDetails } from '../store/app-details';
import { phoneViewport } from '../test/phone';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { details } from '../test/store';
import { useHistoryLayer } from './history-layer';
import { watchResume } from './resume';
import { streamLink } from './stream-link';

let restore = () => {};
afterEach(() => restore());

function Panel() {
  const [open, setOpen] = useState(false);
  const close = useHistoryLayer('search', open, () => setOpen(false));
  const layer = useRouterState({ select: (s) => s.location.state.layer ?? 'none' });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button" onClick={() => void close()}>
        Cancel
      </button>
      <p>{open ? 'panel open' : 'panel closed'}</p>
      <p>layer: {layer}</p>
    </>
  );
}

describe('US-PHONE-04', () => {
  it('a panel opened over the page adds a history step; Back closes it, so does its own button, which steps back', async () => {
    const { router } = renderScreen(Panel, {});
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(await screen.findByText('layer: search')).toBeInTheDocument();
    act(() => router.history.back());
    expect(await screen.findByText('panel closed')).toBeInTheDocument();
    expect(screen.getByText('layer: none')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByText('layer: search')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('panel closed')).toBeInTheDocument();
    expect(screen.getByText('layer: none')).toBeInTheDocument();
    expect(router.history.canGoBack()).toBe(false);
  });

  describe('the app details back control', () => {
    beforeEach(() => {
      restore = phoneViewport();
    });
    const handlers = {
      'store.getApp': () => details(),
      'apps.list': () => ({ apps: [] }),
      'auth.me': fakeMe(),
      'events.stream': () => new Promise(() => {}),
    };
    const Details = () => <AppDetails appId="immich" />;

    it('is "App Store", and does what Back does when there is history', async () => {
      const { router } = renderScreen(Details, handlers, {
        path: '/store/app/immich',
        entries: ['/store/category/media', '/store/app/immich'],
      });
      fireEvent.click(await screen.findByRole('button', { name: 'App Store' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/store/category/media'));
    });

    it('goes to the store after a deep link', async () => {
      const { router } = renderScreen(Details, handlers, { path: '/store/app/immich' });
      fireEvent.click(await screen.findByRole('button', { name: 'App Store' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/store'));
    });
  });

  it('back on the tab: the stream reconnects now, even one that looked connected, and queries refetch', async () => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const attempts: Array<Observer<unknown, unknown>> = [];
    const link = streamLink({ onReset: () => {} })({} as never);
    const sub = link({
      op: { id: 1, type: 'subscription', path: 'events.stream', input: {}, context: {} } as never,
      next: (() =>
        observable((observer) => {
          attempts.push(observer as never);
          return () => {};
        })) as never,
    }).subscribe({});
    attempts[0]!.next({ result: { type: 'started' } });
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'invalidateQueries');
    const stop = watchResume(queryClient);

    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(attempts).toHaveLength(1);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(attempts).toHaveLength(2);
    expect(refetch).toHaveBeenCalledWith({ refetchType: 'active' });

    // iOS restoring the page from its back-forward cache.
    const show = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(show, 'persisted', { value: true });
    window.dispatchEvent(show);
    expect(attempts).toHaveLength(3);
    stop();
    sub.unsubscribe();
    delete (document as { hidden?: boolean }).hidden;
  });
});
