// US-HOME-14 · Act on and clear notifications: an action takes you to the fix and reads the item, the lock
// notification's title opens Settings › Account, "Mark all read", dismissing one, an app that's gone, and marking
// read rolling back when the daemon refuses.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { daemonError } from '../test/render';
import { bell, note, NOW, SAMPLE } from '../test/notifications';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const page = (name: string) => () => <h1>{name}</h1>;
const ROUTES = {
  '/apps/$appId/logs': page('AppLogs'),
  '/store/updates': page('Store updates'),
  '/settings/account': page('Settings › Account'),
};
const app = (id: string) => ({
  id,
  name: id,
  state: 'running',
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});

async function openPanel(handlers: Parameters<typeof bell>[0]) {
  const r = bell(
    {
      'notifications.unreadCount': () => ({ count: 3 }),
      'notifications.list': () => ({ items: SAMPLE, nextCursor: null }),
      'notifications.markRead': () => ({ ok: true }),
      'notifications.markAllRead': () => ({ ok: true }),
      'notifications.dismiss': () => ({ ok: true }),
      'apps.list': () => ({ apps: [app('uptime-kuma')] }),
      ...handlers,
    },
    { routes: ROUTES },
  );
  fireEvent.click(await screen.findByRole('button', { name: /^Notifications/ }));
  const panel = await screen.findByRole('dialog', { name: 'Notifications' });
  await within(panel).findAllByRole('listitem');
  return { ...r, panel };
}

describe('US-HOME-14', () => {
  it('"View logs" opens AppLogs for the app and marks the item read', async () => {
    const { panel, calls, router } = await openPanel({});
    fireEvent.click(within(panel).getByRole('button', { name: 'View logs' }));
    // Over the page it was opened from (D-166).
    await waitFor(() => expect(router.state.location.href).toBe('/?logs=uptime-kuma'));
    expect(calls.find((c) => c.path === 'notifications.markRead')?.input).toEqual({ ids: ['n1'] });
  });

  it('"Review" on "2 app updates available" opens the App Store updates and marks it read', async () => {
    const { panel, calls } = await openPanel({});
    fireEvent.click(within(panel).getByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('heading', { name: 'Store updates' })).toBeInTheDocument();
    expect(calls.find((c) => c.path === 'notifications.markRead')?.input).toEqual({ ids: ['n3'] });
  });

  it('the lock notification itself opens Settings › Account (sessions) and is marked read', async () => {
    const { panel, calls } = await openPanel({});
    const lock = within(panel).getByRole('link', { name: 'Repeated failed logins' });
    expect(lock).toHaveAttribute('href', '/settings/account');
    expect(within(panel).queryByRole('button', { name: 'See sessions' })).toBeNull();
    fireEvent.click(lock);
    expect(await screen.findByRole('heading', { name: 'Settings › Account' })).toBeInTheDocument();
    expect(calls.find((c) => c.path === 'notifications.markRead')?.input).toEqual({ ids: ['n2'] });
  });

  it('"Mark all read" clears every dot and the badge in one call, then is disabled', async () => {
    const { panel, calls } = await openPanel({});
    expect(within(panel).getAllByText('Unread')).toHaveLength(3);
    fireEvent.click(within(panel).getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(within(panel).queryAllByText('Unread')).toHaveLength(0));
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveTextContent('');
    expect(within(panel).getByRole('button', { name: 'Mark all read' })).toBeDisabled();
    expect(calls.filter((c) => c.path === 'notifications.markAllRead')).toHaveLength(1);
  });

  it('a dismiss button on each item takes it off the list', async () => {
    const { panel, calls } = await openPanel({});
    const dismiss = within(panel).getByRole('button', { name: 'Dismiss "Backup finished"' });
    fireEvent.click(dismiss);
    await waitFor(() => expect(within(panel).queryByText('Backup finished')).toBeNull());
    expect(calls.find((c) => c.path === 'notifications.dismiss')?.input).toEqual({ ids: ['n4'] });
    // It was read already, so the badge stays at 3.
    expect(screen.getByRole('button', { name: 'Notifications, 3 new' })).toBeInTheDocument();
  });

  it('an action for an app that has gone says so and marks the item read', async () => {
    const { panel, calls } = await openPanel({ 'apps.list': () => ({ apps: [] }) });
    fireEvent.click(within(panel).getByRole('button', { name: 'View logs' }));
    expect(await screen.findByText('That app is no longer installed')).toBeInTheDocument();
    expect(calls.find((c) => c.path === 'notifications.markRead')?.input).toEqual({ ids: ['n1'] });
    expect(screen.queryByRole('heading', { name: 'AppLogs' })).toBeNull();
  });

  it('marking read is optimistic and rolls back when the daemon refuses', async () => {
    const { panel } = await openPanel({
      'notifications.markAllRead': () => {
        throw daemonError('SOMETHING_NEW');
      },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(within(panel).getAllByText('Unread')).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Notifications, 3 new' })).toBeInTheDocument();
  });

  it("members never get an admin's action", async () => {
    const { panel } = await openPanel({
      'auth.me': fakeMe({ role: 'member' }),
      'notifications.list': () => ({
        items: [note({ id: 'm1', actions: [{ kind: 'navigate', to: '/apps/uptime-kuma/logs' }] })],
        nextCursor: null,
      }),
    });
    await waitFor(() => expect(within(panel).queryByRole('button', { name: 'View logs' })).toBeNull());
  });
});
