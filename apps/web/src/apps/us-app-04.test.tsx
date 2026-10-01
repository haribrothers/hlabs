// US-APP-04 · See an app's status and start, stop or restart it.
import type { AppState } from '@hlabs/api';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { currentToasts, dismissToast } from '../lib/toasts';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppSettings } from './app-settings';

const DAY = 86_400_000;

function open(
  state: AppState,
  handlers: Handlers = {},
  {
    role = 'admin',
    startedAt = null,
    engineRunning = true,
  }: Partial<{
    role: 'admin' | 'member';
    startedAt: number | null;
    engineRunning: boolean;
  }> = {},
) {
  const app = appDetail({
    id: 'vaultwarden',
    name: 'Vaultwarden',
    state,
    startedAt,
    engineRunning,
    urls: { local: 'https://vaultwarden.hlabs.local', tailnet: null },
  });
  let publish!: (event: unknown) => void;
  const stream = () => new Promise((r) => (publish = r));
  const rendered = renderScreen(
    () => <AppSettings appId="vaultwarden" />,
    { 'apps.get': () => ({ ...app }), 'events.stream': stream, 'auth.me': fakeMe({ role }), ...handlers },
    { path: '/apps/vaultwarden/settings' },
  );
  /** app.stateChanged from the daemon; apps.get answers the same from then on. */
  const changed = async (next: AppState) => {
    app.state = next;
    await act(async () =>
      publish({
        id: String(Math.random()),
        data: { type: 'app.stateChanged', data: { appId: 'vaultwarden', state: next, detail: null } },
      }),
    );
  };
  return { ...rendered, app, changed };
}

const actions = () => ['Restart', 'Stop', 'Start'].map((name) => screen.queryByRole('button', { name }));

afterEach(() => {
  vi.restoreAllMocks();
  for (const t of currentToasts()) dismissToast(t.id);
});

describe('US-APP-04', () => {
  it('the header shows the icon, name, "Running · up 6 days" and Close', async () => {
    open('running', {}, { startedAt: Date.now() - 6 * DAY - 3_600_000 });
    expect(await screen.findByRole('heading', { level: 1, name: 'Vaultwarden' })).toBeInTheDocument();
    expect(screen.getByText('Running · up 6 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it.each([
    [3 * 60_000 + 10_000, 'up 3 minutes'],
    [5 * 3_600_000 + 60_000, 'up 5 hours'],
    [DAY, 'up 1 day'],
  ])('uptime %i ms reads "%s"', async (ms, text) => {
    open('running', {}, { startedAt: Date.now() - ms });
    expect(await screen.findByText(`Running · ${text}`)).toBeInTheDocument();
  });

  it('the App sections tabs show Overview; tabs whose feature is not built yet are hidden', async () => {
    open('running');
    const tabs = await screen.findByRole('tablist', { name: 'App sections' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Overview']);
    expect(within(tabs).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a running app has Open, Restart, Stop and Logs; a stopped one Start instead of Stop', async () => {
    const opened = vi.spyOn(browser, 'open').mockImplementation(() => {});
    open('running');
    for (const name of ['Open', 'Restart', 'Stop', 'Logs']) {
      expect(await screen.findByRole('button', { name })).toBeEnabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(opened).toHaveBeenCalledWith('https://vaultwarden.hlabs.local');
  });

  it('a stopped app offers Start instead of Stop', async () => {
    open('stopped');
    expect(await screen.findByRole('button', { name: 'Start' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('after Stop, the buttons wait until app.stateChanged reports a settled state, and the header follows', async () => {
    const { calls, changed } = open('running', { 'apps.stop': () => ({ ok: true }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await vi.waitFor(() => expect(calls).toContainEqual({ path: 'apps.stop', input: { appId: 'vaultwarden' } }));
    expect(await screen.findByText('Stopping…')).toBeInTheDocument();
    for (const button of actions()) if (button) expect(button).toBeDisabled();
    await changed('stopped');
    expect(await screen.findByRole('button', { name: 'Start' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeEnabled();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('a restart that ends in error shows "<App> didn\'t start. Check the logs." with Logs', async () => {
    const { changed } = open('running', { 'apps.restart': () => ({ ok: true }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Restart' }));
    expect(await screen.findByText('Restarting…')).toBeInTheDocument();
    await changed('error');
    await waitFor(() =>
      expect(currentToasts()).toContainEqual(
        expect.objectContaining({
          tone: 'danger',
          title: "Vaultwarden didn't start. Check the logs.",
          actions: [expect.objectContaining({ label: 'Logs', to: '/apps/vaultwarden/logs' })],
        }),
      ),
    );
  });

  it('without the engine, Restart and Stop are disabled with "Start the container engine first"', async () => {
    open('running', {}, { engineRunning: false });
    for (const name of ['Restart', 'Stop']) {
      const button = await screen.findByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', 'Start the container engine first');
    }
  });

  it('Logs opens the logs; Close goes back to where the settings were opened from', async () => {
    const { router } = open('running');
    fireEvent.click(await screen.findByRole('button', { name: 'Logs' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/apps/vaultwarden/logs'));
    await act(() => router.navigate({ to: '/apps/vaultwarden/settings' as never }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/apps/vaultwarden/logs'));
  });

  it('members get "You don\'t have access to this" and never load the app', async () => {
    const { calls } = open('running', {}, { role: 'member' });
    expect(await screen.findByRole('heading', { name: "You don't have access to this" })).toBeInTheDocument();
    expect(calls.some((c) => c.path === 'apps.get')).toBe(false);
  });
});
