// US-HOME-08 · Recover a stopped or broken app from its tile.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogs } from '../apps/app-logs';
import { browser } from '../lib/browser';
import { currentToasts, dismissToast } from '../lib/toasts';
import { Toaster } from '../shell/toaster';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import type { HomeApp } from './app-grid';
import { HomeView } from './home-view';

const never = () => new Promise(() => {});
const app = (id: string, name: string, state: HomeApp['state']): HomeApp => ({
  id,
  name,
  state,
  icon: { logoUrl: null, gradient: null, fallback: null },
  embed: false,
  ownLogin: false,
  urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
});

function home(apps: HomeApp[], handlers: Handlers = {}, role: 'admin' | 'member' = 'admin') {
  return renderScreen(
    () => (
      <>
        <HomeView />
        <Toaster />
      </>
    ),
    {
      'auth.me': fakeMe({ role }),
      'home.getLayout': () => ({ items: [], dock: [] }),
      'apps.list': () => ({ apps }),
      'events.stream': never,
      ...handlers,
    },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-HOME-08', () => {
  it("a stopped app says so with Start, and isn't opened; Start sends one request however often it's pressed", async () => {
    const opened = vi.spyOn(browser, 'open').mockImplementation(() => {});
    let release!: () => void;
    const { calls, router } = home([app('pihole', 'Pi-hole', 'stopped')], {
      'apps.start': () => new Promise((r) => (release = () => r({ ok: true }))),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Pi-hole, stopped' }));
    const toast = await screen.findByText('Pi-hole is stopped');
    expect(opened).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe('/');
    const start = within(toast.closest('[role="status"], [role="alert"], li, div')!.parentElement!).getByRole(
      'button',
      { name: 'Start' },
    );
    fireEvent.click(start);
    fireEvent.click(start);
    await waitFor(() => expect(calls.filter((c) => c.path === 'apps.start')).toHaveLength(1));
    expect(calls.find((c) => c.path === 'apps.start')?.input).toEqual({ appId: 'pihole' });
    release();
    await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain('Starting Pi-hole…'));
  });

  it("an app in error opens its logs, which say why it isn't running", async () => {
    const { router } = home([app('kuma', 'Uptime Kuma', 'error')]);
    fireEvent.click(await screen.findByRole('button', { name: 'Uptime Kuma, error' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/apps/kuma/logs'));
  });

  it('the logs of an app in error start with the reason', async () => {
    renderScreen(
      () => <AppLogs appId="kuma" />,
      {
        'auth.me': fakeMe({ role: 'admin' }),
        'apps.get': () =>
          appDetail({
            id: 'kuma',
            name: 'Uptime Kuma',
            state: 'error',
            stateDetail: { code: 'APP_PORT_IN_USE', port: 3001, step: 'start' },
          }),
        'apps.logs': () => ({ lines: [] }),
        'apps.watchLogs': never,
        'events.stream': never,
      },
      { path: '/apps/kuma/logs' },
    );
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent("Uptime Kuma isn't responding.");
    expect(status).toHaveTextContent('3001');
  });

  it.each(['stopped', 'error'] as const)(
    'a member clicking a %s app is told whom to ask, with no button',
    async (state) => {
      const { router } = home(
        [app('pihole', 'Pi-hole', state)],
        {
          'account.get': () => ({ adminName: 'Hari' }),
        },
        'member',
      );
      fireEvent.click(await screen.findByRole('button', { name: `Pi-hole, ${state}` }));
      const said = "Pi-hole isn't running right now. Ask Hari to start it.";
      await waitFor(() => expect(currentToasts().map((t) => t.title)).toContain(said));
      expect(currentToasts().find((t) => t.title === said)?.actions).toBeUndefined();
      expect(router.state.location.pathname).toBe('/');
    },
  );
});
