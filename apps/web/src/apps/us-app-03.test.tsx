// US-APP-03 · Opening an app that isn't running.
import type { AppState } from '@hlabs/api';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { daemonError, renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppWindow } from './app-window';

const never = () => new Promise(() => {});

function open(state: AppState, handlers: Handlers = {}, role: 'admin' | 'member' = 'admin', engineRunning = true) {
  const app = appDetail({
    id: 'jellyfin',
    name: 'Jellyfin',
    state,
    embed: true,
    engineRunning,
    urls: { local: 'https://jellyfin.hlabs.local', tailnet: null },
  });
  const rendered = renderScreen(
    () => <AppWindow appId="jellyfin" />,
    { 'apps.get': () => ({ ...app }), 'events.stream': never, 'auth.me': fakeMe({ role }), ...handlers },
    { path: '/apps/jellyfin' },
  );
  // What apps.get answers from now on (an event refetches it).
  return { ...rendered, app };
}

/** The frame area: the window's content below its header. */
const frameArea = async () => {
  const win = await screen.findByRole('region', { name: 'App window' });
  return win.querySelector('header')!.nextElementSibling as HTMLElement;
};

describe('US-APP-03', () => {
  it('a stopped app says so, with Start for admins; Start shows "Starting…" at once', async () => {
    const { calls } = open('stopped', { 'apps.start': () => ({ ok: true }) });
    const area = await frameArea();
    expect(await within(area).findByText('Jellyfin is stopped.')).toBeInTheDocument();
    fireEvent.click(await within(area).findByRole('button', { name: 'Start' }));
    await vi.waitFor(() => expect(calls).toContainEqual({ path: 'apps.start', input: { appId: 'jellyfin' } }));
    expect(await within(area).findByText('Starting…')).toBeInTheDocument();
    expect(screen.queryByTitle('Jellyfin')).toBeNull();
  });

  it('members see "Ask an admin to start it." and no Start', async () => {
    open('stopped', {}, 'member');
    const area = await frameArea();
    expect(await within(area).findByText('Ask an admin to start it.')).toBeInTheDocument();
    expect(within(area).queryByRole('button')).toBeNull();
  });

  it("an app in error says it isn't responding, with Restart app and Logs for admins", async () => {
    const { calls } = open('error', { 'apps.restart': () => ({ ok: true }) });
    const area = await frameArea();
    expect(await within(area).findByText("Jellyfin isn't responding.")).toBeInTheDocument();
    expect(within(area).getByRole('button', { name: 'Logs' })).toBeInTheDocument();
    fireEvent.click(within(area).getByRole('button', { name: 'Restart app' }));
    await vi.waitFor(() => expect(calls).toContainEqual({ path: 'apps.restart', input: { appId: 'jellyfin' } }));
    // error → starting (US-APP-03): restarting an app that isn't responding starts it again.
    expect(await within(area).findByText('Starting…')).toBeInTheDocument();
  });

  it("Logs in the frame area opens the app's logs", async () => {
    const { router } = open('error');
    fireEvent.click(await within(await frameArea()).findByRole('button', { name: 'Logs' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ panel: 'logs' }));
  });

  it("members see that it isn't responding, without the admin buttons", async () => {
    open('error', {}, 'member');
    const area = await frameArea();
    expect(await within(area).findByText("Jellyfin isn't responding.")).toBeInTheDocument();
    expect(within(area).queryByRole('button')).toBeNull();
  });

  it.each(['starting', 'restarting', 'updating', 'rolling_back'] as const)(
    'while %s, the frame area shows the status with a spinner, then loads the app once it runs',
    async (state) => {
      let publish!: (event: unknown) => void;
      const event = new Promise((r) => (publish = r));
      const { app } = open(state, { 'events.stream': () => event });
      const area = await frameArea();
      expect(await within(area).findByText(/…$/)).toBeInTheDocument();
      expect(screen.queryByTitle('Jellyfin')).toBeNull();
      app.state = 'running';
      await act(async () =>
        publish({
          id: '1',
          data: { type: 'app.stateChanged', data: { appId: 'jellyfin', state: 'running', detail: null } },
        }),
      );
      expect(await screen.findByTitle('Jellyfin')).toBeInTheDocument();
    },
  );

  it('a member the app isn\'t shared with gets "You don\'t have access to this" at the same address', async () => {
    const { router } = open('running', { 'apps.get': () => Promise.reject(daemonError('ACCESS_DENIED')) }, 'member');
    expect(await screen.findByRole('heading', { name: "You don't have access to this" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Home' })).toHaveAttribute('href', '/');
    expect(router.state.location.pathname).toBe('/apps/jellyfin');
  });

  it('when the container engine has stopped, the frame area says so whatever the app state', async () => {
    open('running', {}, 'admin', false);
    const area = await frameArea();
    expect(await within(area).findByText('The container engine has stopped')).toBeInTheDocument();
    expect(within(area).getByText('All apps are offline. Your data is safe.')).toBeInTheDocument();
    expect(screen.queryByTitle('Jellyfin')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restart app' })).toBeDisabled();
  });

  it('the engine stopping while the window is open swaps the app for the message (engine.status)', async () => {
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    const { app } = open('running', { 'events.stream': () => event });
    await screen.findByTitle('Jellyfin');
    app.engineRunning = false;
    await act(async () =>
      publish({
        id: '1',
        data: {
          type: 'engine.status',
          data: { running: false, kind: 'orbstack', managedByHlabs: false, socketPath: '/x.sock' },
        },
      }),
    );
    expect(await screen.findByText('The container engine has stopped')).toBeInTheDocument();
    expect(screen.queryByTitle('Jellyfin')).toBeNull();
  });
});
