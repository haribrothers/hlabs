// US-STORE-17 · Roll back an update that doesn't start (the dashboard's side): Update in App settings with how far it
// has got, the banner on the app's details page (View log at the failed update's time, Try again, Dismiss), and the
// logs opening at that moment. "Restore from backup" waits for backups (phase 5), the Updates page for phase 7.
import type { AppDetail, LogLine } from '@hlabs/api';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDetails } from '../store/app-details';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail, details, installJob } from '../test/store';
import { AppLogs } from './app-logs';
import { AppSettings } from './app-settings';

const never = () => new Promise(() => {});
const AT = new Date(2026, 9, 1, 3, 12, 0).getTime();
const rolledBack = (over: Partial<NonNullable<AppDetail['rolledBack']>> = {}) => ({
  notificationId: 'n1',
  restored: true,
  fromVersion: '2026.9.1',
  toVersion: '2026.9.2',
  jobId: 'j1',
  at: AT,
  ...over,
});
const homeAssistant = (over: Partial<AppDetail> = {}) =>
  appDetail({ id: 'immich', name: 'Home Assistant', state: 'running', version: '2026.9.1', ...over });

function settings(app: AppDetail, handlers: Handlers = {}) {
  return renderScreen(
    () => <AppSettings appId="immich" />,
    {
      'apps.get': () => app,
      'jobs.list': () => ({ items: [] }),
      'events.stream': never,
      'auth.me': fakeMe({ role: 'admin' }),
      ...handlers,
    },
    { path: '/apps/immich/settings' },
  );
}

function storeDetails(app: AppDetail, role: 'admin' | 'member' = 'admin', handlers: Handlers = {}) {
  return renderScreen(() => <AppDetails appId="immich" />, {
    'store.getApp': () => details(),
    'apps.list': () => ({
      apps: [
        {
          id: 'immich',
          name: 'Home Assistant',
          state: 'running',
          icon: { logoUrl: null, gradient: null, fallback: null },
          embed: false,
          urls: { local: 'https://immich.hlabs.local', tailnet: null },
        },
      ],
    }),
    'apps.get': () => app,
    'jobs.list': () => ({ items: [] }),
    'events.stream': never,
    'auth.me': fakeMe({ role }),
    ...handlers,
  });
}

describe('US-STORE-17', () => {
  it('a newer version in the store shows Update in App settings, which starts an update job', async () => {
    const { calls } = settings(homeAssistant({ latestVersion: '2026.9.2' }), {
      'apps.update': () => ({ jobId: 'j2' }),
    });
    expect(await screen.findByText('Version 2026.9.1 · 2026.9.2 available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'apps.update', input: { appId: 'immich' } }));
  });

  it('while it updates the header says how far it has got and Update goes', async () => {
    settings(homeAssistant({ state: 'updating', latestVersion: '2026.9.2' }), {
      'jobs.list': () => ({ items: [installJob({ kind: 'app_update', target: 'immich', progress: 40 })] }),
    });
    expect(await screen.findByText('Updating… 40%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('up to date: no Update', async () => {
    settings(homeAssistant({ latestVersion: null }));
    await screen.findByText('Version 2026.9.1 · up to date');
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('after a rollback the details page says so, with View log at that moment and Try again', async () => {
    const { calls } = storeDetails(homeAssistant({ rolledBack: rolledBack() }), 'admin', {
      'apps.update': () => ({ jobId: 'j2' }),
    });
    const banner = await screen.findByRole('status');
    expect(
      within(banner).getByText("Home Assistant's update didn't start, so hlabs rolled it back"),
    ).toBeInTheDocument();
    expect(within(banner).getByText("It's running 2026.9.1 again.")).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'View log' })).toHaveAttribute(
      'href',
      `/apps/immich/logs?at=${AT}`,
    );
    // Restoring data from the backup taken before the update waits for backups (phase 5).
    expect(within(banner).queryByRole('button', { name: 'Restore from backup' })).toBeNull();
    fireEvent.click(within(banner).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(calls).toContainEqual({ path: 'apps.update', input: { appId: 'immich' } }));
  });

  it('Dismiss marks it read, so it doesn’t come back', async () => {
    let dismissed = false;
    const { calls } = storeDetails(homeAssistant({ rolledBack: rolledBack() }), 'admin', {
      'apps.get': () => homeAssistant({ rolledBack: dismissed ? null : rolledBack() }),
      'notifications.markRead': () => {
        dismissed = true;
        return { ok: true };
      },
    });
    const banner = await screen.findByRole('status');
    fireEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(calls).toContainEqual({ path: 'notifications.markRead', input: { ids: ['n1'] } });
  });

  it("when going back failed too it says it couldn't be restored, without Try again", async () => {
    storeDetails(homeAssistant({ state: 'error', rolledBack: rolledBack({ restored: false }) }));
    const banner = await screen.findByRole('status');
    expect(within(banner).getByText("Home Assistant couldn't be restored")).toBeInTheDocument();
    expect(within(banner).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(within(banner).getByRole('link', { name: 'View log' })).toBeInTheDocument();
  });

  it('members never see it (apps.get is not asked)', async () => {
    const { calls } = storeDetails(homeAssistant({ rolledBack: rolledBack() }), 'member');
    await screen.findByRole('heading', { level: 1, name: 'Immich' });
    await waitFor(() => expect(calls.some((c) => c.path === 'auth.me')).toBe(true));
    expect(screen.queryByRole('status')).toBeNull();
    expect(calls.some((c) => c.path === 'apps.get')).toBe(false);
  });

  describe('View log', () => {
    const scrolled: string[] = [];
    beforeEach(() => {
      Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
        scrolled.push(this.textContent ?? '');
      });
    });
    afterEach(() => {
      scrolled.length = 0;
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    });

    it('opens the logs at the failed update, not following', async () => {
      const line = (s: number, text: string): LogLine => ({
        service: 'server',
        stream: 'stdout',
        ts: AT + s * 1000,
        line: text,
      });
      renderScreen(
        () => <AppLogs appId="immich" at={AT} />,
        {
          'apps.get': () => homeAssistant(),
          'apps.logs': () => ({ lines: [line(-60, 'before'), line(2, 'Migration failed'), line(30, 'after')] }),
          'apps.watchLogs': never,
          'events.stream': never,
          'auth.me': fakeMe({ role: 'admin' }),
        },
        { path: '/apps/immich/logs' },
      );
      await screen.findByText('Migration failed');
      await waitFor(() => expect(scrolled[0]).toContain('Migration failed'));
      expect(screen.getByRole('button', { name: /Following/ })).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
