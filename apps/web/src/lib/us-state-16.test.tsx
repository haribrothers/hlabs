import type { Notification } from '@hlabs/api';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../shell/toaster';
import { renderWithDaemon } from '../test/render';
import { NotificationFeed } from './notification-feed';
import { currentToasts, dismissToast, onScreen, QUEUED_TOASTS, showToast } from './toasts';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
  vi.useRealTimers();
});

const shown = () => onScreen(currentToasts()).map((t) => t.title);

const notification = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  kind: 'app.startFailed',
  target: 'uptime-kuma',
  severity: 'critical',
  title: "Uptime Kuma couldn't start",
  body: 'Port 3001 is already in use by another program.',
  actions: [],
  createdAt: 1_000,
  readAt: null,
  ...over,
});

const created = (n: Notification, at = n.createdAt) => {
  const { id, readAt: _r, ...rest } = n;
  return { type: 'notification.created' as const, at, data: { ...rest, notificationId: id } };
};

describe('US-STATE-16', () => {
  it('at most 3 show; the rest wait with their time held and appear as others leave', () => {
    vi.useFakeTimers();
    for (const t of ['one', 'two', 'three', 'four']) showToast({ tone: 'success', title: t });
    expect(shown()).toEqual(['two', 'three', 'four']);
    vi.advanceTimersByTime(5_000);
    // The three on screen went; "one" waited, and now counts down its full 5 s.
    expect(shown()).toEqual(['one']);
    vi.advanceTimersByTime(4_999);
    expect(shown()).toEqual(['one']);
    vi.advanceTimersByTime(1);
    expect(shown()).toEqual([]);
  });

  it('danger toasts are never dropped from the wait; others are once too many wait', () => {
    showToast({ tone: 'danger', title: 'danger' });
    for (let i = 0; i < QUEUED_TOASTS + 5; i++) showToast({ tone: 'warning', title: `w${i}` });
    const titles = currentToasts().map((t) => t.title);
    expect(titles).toContain('danger');
    expect(titles).toHaveLength(QUEUED_TOASTS + 3);
  });

  it('a repeat of the same kind and target updates the toast instead of stacking', () => {
    showToast({ tone: 'danger', title: "Uptime Kuma couldn't start", key: 'app.startFailed:uptime-kuma' });
    showToast({ tone: 'danger', title: "Uptime Kuma couldn't start again", key: 'app.startFailed:uptime-kuma' });
    expect(currentToasts().map((t) => t.title)).toEqual(["Uptime Kuma couldn't start again"]);
  });

  it('notifications become toasts; replays of old good news are skipped; read elsewhere hides them', async () => {
    const show = vi.fn(showToast);
    const hide = vi.fn();
    let now = 10_000;
    const feed = new NotificationFeed({ show, hide, fetchSince: async () => [], now: () => now });
    await feed.onConnected();
    feed.onCreated(created(notification({ createdAt: 10_000 }), 10_000));
    feed.onCreated(created(notification({ createdAt: 10_000 }), 10_000));
    expect(show).toHaveBeenCalledOnce();
    expect(currentToasts()[0]).toMatchObject({
      tone: 'danger',
      notificationId: 'n1',
      key: 'app.startFailed:uptime-kuma',
    });

    feed.onDisconnected();
    now = 20_000;
    await feed.onConnected();
    // Resumed events from before this connection: a success isn't worth showing late; a warning is.
    feed.onCreated(created(notification({ id: 'n2', severity: 'success', title: 'Immich is ready' }), 15_000));
    feed.onCreated(created(notification({ id: 'n3', severity: 'warning', title: 'Low disk space' }), 15_000));
    expect(show.mock.calls.map((c) => c[0].title)).toEqual(["Uptime Kuma couldn't start", 'Low disk space']);

    feed.onRead({ type: 'notification.read', at: 21_000, data: { ids: ['n1'] } });
    expect(hide).toHaveBeenCalledWith(['n1']);
  });

  it('after a reconnect, unread warning and critical ones from the gap are fetched and shown; nothing else', async () => {
    const show = vi.fn();
    let now = 1_000;
    const fetchSince = vi.fn(async () => [
      notification({ id: 'a', severity: 'critical', title: 'Critical', createdAt: 5_000 }),
      notification({
        id: 'b',
        severity: 'warning',
        title: 'Warning',
        kind: 'disk.low',
        target: null,
        createdAt: 4_000,
      }),
      notification({ id: 'c', severity: 'success', title: 'Success', createdAt: 3_000 }),
      notification({ id: 'd', severity: 'info', title: 'Info', createdAt: 3_000 }),
      notification({ id: 'e', severity: 'critical', title: 'Already read', readAt: 4_500, createdAt: 3_000 }),
    ]);
    const feed = new NotificationFeed({ show, hide: vi.fn(), fetchSince, now: () => now });
    await feed.onConnected();
    expect(fetchSince).not.toHaveBeenCalled();
    now = 2_000;
    feed.onDisconnected();
    now = 9_000;
    await feed.onConnected();
    expect(fetchSince).toHaveBeenCalledWith(2_000);
    expect(show.mock.calls.map((c) => c[0].title)).toEqual(['Warning', 'Critical']);
  });

  it('dismissing a notification’s toast marks it read; a local toast only hides', async () => {
    const markRead = vi.fn(() => ({ ok: true }));
    renderWithDaemon(<Toaster />, { 'notifications.markRead': markRead });
    act(() => {
      showToast({ tone: 'danger', title: 'From a notification', notificationId: 'n1' });
      showToast({ tone: 'danger', title: 'Local' });
    });
    const [local, fromNotification] = screen.getAllByRole('alert');
    fireEvent.click(within(local!).getByRole('button', { name: 'Dismiss' }));
    expect(markRead).not.toHaveBeenCalled();
    fireEvent.click(within(fromNotification!).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(markRead).toHaveBeenCalledWith({ ids: ['n1'] }));
    expect(currentToasts()).toEqual([]);
  });
});
