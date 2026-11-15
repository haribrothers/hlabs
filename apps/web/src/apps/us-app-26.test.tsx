// US-APP-26 · Know when an app stops working: the admins' "<App> stopped working" toast with Restart and View logs,
// and the broken app's Logs saying what happened.
import type { Notification } from '@hlabs/api';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotificationFeed } from '../lib/notification-feed';
import { currentToasts, dismissToast, showToast } from '../lib/toasts';
import { Toaster } from '../shell/toaster';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppLogs } from './app-logs';

afterEach(() => {
  for (const t of currentToasts()) dismissToast(t.id);
});

const never = () => new Promise(() => {});

/** The notification the daemon makes (05 US-APP-26). */
const crashed = (over: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  kind: 'app.crashed',
  target: 'uptime-kuma',
  severity: 'warning',
  title: 'Uptime Kuma stopped working',
  body: 'It quit unexpectedly 3 times in 5 minutes.',
  actions: [
    { kind: 'mutation', procedure: 'apps.restart', input: { appId: 'uptime-kuma' }, label: 'Restart' },
    { kind: 'navigate', to: '/apps/uptime-kuma/logs' },
  ],
  createdAt: 10_000,
  readAt: null,
  ...over,
});

async function toast(n: Notification, role: 'admin' | 'member' = 'admin') {
  const restart = { calls: [] as unknown[] };
  renderScreen(() => <Toaster />, {
    'auth.me': fakeMe({ role }),
    'apps.restart': (input) => (restart.calls.push(input), { ok: true }),
  });
  const feed = new NotificationFeed({ show: showToast, hide: () => {}, fetchSince: async () => [], now: () => 10_000 });
  await feed.onConnected();
  const { id, readAt: _r, ...rest } = n;
  act(() => feed.onCreated({ type: 'notification.created', at: 10_000, data: { ...rest, notificationId: id } }));
  return restart;
}

describe('US-APP-26', () => {
  it('the admins get a warning toast "<App> stopped working" with the reason, Restart and View logs', async () => {
    const restart = await toast(crashed());
    const t = await screen.findByText('Uptime Kuma stopped working');
    const card = t.closest('[role="alert"], [role="status"]') as HTMLElement;
    expect(within(card).getByText('It quit unexpectedly 3 times in 5 minutes.')).toBeInTheDocument();
    expect(currentToasts()[0]).toMatchObject({ tone: 'warning', key: 'app.crashed:uptime-kuma' });
    await waitFor(() => expect(within(card).getByRole('link', { name: 'View logs' })).toBeInTheDocument());
    fireEvent.click(within(card).getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(restart.calls).toEqual([{ appId: 'uptime-kuma' }]));
  });

  it('"<App> is working again" is a success toast', async () => {
    await toast(
      crashed({
        id: 'n2',
        kind: 'app.recovered',
        severity: 'success',
        title: 'Uptime Kuma is working again',
        body: null,
        actions: [],
      }),
    );
    expect(await screen.findByText('Uptime Kuma is working again')).toBeInTheDocument();
    expect(currentToasts()[0]).toMatchObject({ tone: 'success' });
  });

  describe("the broken app's Logs say what happened", () => {
    const open = (stateDetail: Record<string, unknown>) =>
      renderScreen(
        () => <AppLogs appId="uptime-kuma" />,
        {
          'apps.get': () => appDetail({ id: 'uptime-kuma', name: 'Uptime Kuma', state: 'error', stateDetail }),
          'apps.logs': () => ({ lines: [] }),
          'apps.watchLogs': never,
          'events.stream': never,
          'system.info': never,
          'auth.me': fakeMe({ role: 'admin' }),
        },
        { path: '/apps/uptime-kuma/logs' },
      );
    const reason = async () =>
      (await screen.findByText(/stopped working|isn't responding/)).closest('[role="status"]')!.textContent;

    it.each([
      [
        { code: 'APP_CRASHED', service: 'uptime-kuma', exitCode: 1, oom: false, loop: true },
        'It quit unexpectedly 3 times in 5 minutes.',
      ],
      [{ code: 'APP_CRASHED', service: 'uptime-kuma', exitCode: 1, oom: false, loop: false }, 'It quit unexpectedly.'],
      [{ code: 'APP_CRASHED', service: 'uptime-kuma', exitCode: 137, oom: true, loop: false }, 'It ran out of memory.'],
      [{ code: 'APP_UNHEALTHY', service: 'uptime-kuma' }, 'It stopped answering.'],
    ])('%o: "Uptime Kuma stopped working" and "%s"', async (detail, text) => {
      open(detail);
      await screen.findByText('Uptime Kuma stopped working');
      expect(await reason()).toBe(`Uptime Kuma stopped working${text}`);
    });

    it('an app that never started still "isn\'t responding"', async () => {
      open({ code: 'APP_HEALTH_TIMEOUT', seconds: 120 });
      expect(await screen.findByText("Uptime Kuma isn't responding.")).toBeInTheDocument();
    });
  });
});
