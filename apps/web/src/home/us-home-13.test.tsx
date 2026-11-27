// US-HOME-13 · Open the notifications panel: the bell and its count, the panel grouped Today and Earlier, each item's
// icon, words, time and action, new ones arriving on the event stream, the empty panel, and closing it.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationTime } from '../lib/notification-time';
import { bell, MIN, note, NOW, SAMPLE } from '../test/notifications';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('US-HOME-13', () => {
  it('the bell says how many are new; with none, no badge', async () => {
    bell({ 'notifications.unreadCount': () => ({ count: 3 }) });
    const b = await screen.findByRole('button', { name: 'Notifications, 3 new' });
    expect(b).toHaveTextContent('3');
    expect(b).toHaveAttribute('aria-expanded', 'false');
  });

  it('with none unread the bell is just "Notifications"', async () => {
    bell({ 'notifications.unreadCount': () => ({ count: 0 }) });
    const b = await screen.findByRole('button', { name: 'Notifications' });
    expect(b).toHaveTextContent('');
  });

  it('opens a panel titled "Notifications" with "Mark all read", grouped Today and Earlier', async () => {
    const { calls } = bell({
      'notifications.unreadCount': () => ({ count: 3 }),
      'notifications.list': () => ({ items: SAMPLE, nextCursor: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 3 new' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Mark all read' })).toBeEnabled();
    const today = await within(panel).findByRole('region', { name: 'Today' });
    const earlier = within(panel).getByRole('region', { name: 'Earlier' });
    expect(within(today).getAllByRole('listitem')).toHaveLength(3);
    expect(within(earlier).getAllByRole('listitem')).toHaveLength(1);
    expect(calls.find((c) => c.path === 'notifications.list')?.input).toMatchObject({ limit: 50 });
  });

  it('each item: icon, title, body, time and its action; unread ones have a dot', async () => {
    bell({
      'notifications.unreadCount': () => ({ count: 3 }),
      'notifications.list': () => ({ items: SAMPLE, nextCursor: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /Notifications/ }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    const [kuma, , updates] = await within(panel).findAllByRole('listitem');
    expect(kuma).toHaveTextContent('Uptime Kuma couldn’t start');
    expect(kuma).toHaveTextContent('Port 3001 is in use by another program.');
    expect(kuma).toHaveTextContent('5 min ago');
    expect(within(kuma!).getByRole('button', { name: 'View logs' })).toBeInTheDocument();
    expect(within(kuma!).getByText('Unread')).toHaveClass('sr-only');
    expect(updates).toHaveTextContent('3 hours ago');
    expect(within(updates!).getByRole('button', { name: 'Review' })).toBeInTheDocument();
    const backup = within(within(panel).getByRole('region', { name: 'Earlier' })).getByRole('listitem');
    expect(backup).toHaveTextContent('Yesterday, 03:12');
    expect(within(backup).queryByText('Unread')).toBeNull();
  });

  it('says when it arrived: just now, minutes, hours, yesterday, then the date (24-hour clock)', () => {
    expect(notificationTime(NOW - 20_000, NOW)).toBe('Just now');
    expect(notificationTime(NOW - 5 * MIN, NOW)).toBe('5 min ago');
    expect(notificationTime(NOW - 60 * MIN, NOW)).toBe('1 hour ago');
    expect(notificationTime(NOW - 3 * 60 * MIN, NOW)).toBe('3 hours ago');
    expect(notificationTime(new Date(2026, 10, 21, 3, 12).getTime(), NOW)).toBe('Yesterday, 03:12');
    expect(notificationTime(new Date(2026, 10, 14, 18, 40).getTime(), NOW)).toBe('14 Nov, 18:40');
  });

  it('a new one on the event stream adds to the badge and tops Today while the panel is open', async () => {
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    let items = SAMPLE.slice(0, 1);
    let count = 1;
    bell({
      'notifications.unreadCount': () => ({ count }),
      'notifications.list': () => ({ items, nextCursor: null }),
      'events.stream': () => event,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 new' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    await within(panel).findByText('Uptime Kuma couldn’t start');
    const fresh = note({
      id: 'n9',
      severity: 'success',
      title: 'Immich is ready',
      body: 'Installed and running.',
      createdAt: NOW,
    });
    items = [fresh, ...items];
    count = 2;
    await act(async () =>
      publish({ id: '7', data: { type: 'notification.created', at: NOW, data: { ...fresh, notificationId: 'n9' } } }),
    );
    await screen.findByRole('button', { name: 'Notifications, 2 new' });
    await waitFor(() => {
      const today = within(panel).getByRole('region', { name: 'Today' });
      expect(within(today).getAllByRole('listitem')[0]).toHaveTextContent('Immich is ready');
    });
  });

  it('with none at all: "You\'re all caught up"', async () => {
    bell({
      'notifications.unreadCount': () => ({ count: 0 }),
      'notifications.list': () => ({ items: [], nextCursor: null }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(await within(panel).findByText("You're all caught up")).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Mark all read' })).toBeDisabled();
  });

  it('Escape or a click outside closes it and focus goes back to the bell', async () => {
    bell({
      'notifications.unreadCount': () => ({ count: 0 }),
      'notifications.list': () => ({ items: [], nextCursor: null }),
    });
    const b = await screen.findByRole('button', { name: 'Notifications' });
    fireEvent.click(b);
    await screen.findByRole('dialog', { name: 'Notifications' });
    expect(b).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(b).toHaveFocus();

    fireEvent.click(b);
    await screen.findByRole('dialog', { name: 'Notifications' });
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(b).toHaveFocus();
  });

  it('pages 50 at a time', async () => {
    const { calls } = bell({
      'notifications.unreadCount': () => ({ count: 0 }),
      'notifications.list': (input) =>
        (input as { cursor?: string }).cursor
          ? {
              items: [note({ id: 'old', title: 'Older one', createdAt: NOW - 3 * 86_400_000, readAt: 1 })],
              nextCursor: null,
            }
          : { items: SAMPLE, nextCursor: 'c1' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Older one')).toBeInTheDocument();
    expect(
      calls.filter((c) => c.path === 'notifications.list').map((c) => (c.input as { cursor?: string }).cursor),
    ).toEqual([undefined, 'c1']);
  });
});
