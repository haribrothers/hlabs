// US-APP-02 · App window controls.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from '../lib/browser';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppWindow } from './app-window';

const never = () => new Promise(() => {});
const jellyfin = appDetail({
  id: 'jellyfin',
  name: 'Jellyfin',
  state: 'running',
  embed: true,
  urls: { local: 'https://jellyfin.hlabs.local', tailnet: null },
});

function open(handlers: Handlers = {}, role: 'admin' | 'member' = 'admin') {
  return renderScreen(
    () => <AppWindow appId="jellyfin" />,
    { 'apps.get': () => jellyfin, 'events.stream': never, 'auth.me': fakeMe({ role }), ...handlers },
    { path: '/apps/jellyfin' },
  );
}

afterEach(() => vi.restoreAllMocks());

describe('US-APP-02', () => {
  it('admins get Restart app, Logs, App settings, Open in a new tab and Close app, named and with tooltips', async () => {
    open();
    const win = await screen.findByRole('region', { name: 'App window' });
    for (const name of ['Restart app', 'Logs', 'App settings', 'Open in a new tab', 'Close app', 'Back to Home']) {
      expect(await within(win).findByRole('button', { name })).toHaveAttribute('title', name);
    }
  });

  it('members get only Open in a new tab, Close app and Back to Home', async () => {
    open({}, 'member');
    const win = await screen.findByRole('region', { name: 'App window' });
    await within(win).findByRole('button', { name: 'Open in a new tab' });
    expect(
      within(win)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Back to Home', 'Open in a new tab', 'Close app']);
  });

  it('Restart shows "Restarting…" and a spinner, then the frame comes back when the app runs again', async () => {
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    const { calls } = open({ 'apps.restart': () => ({ ok: true }), 'events.stream': () => event });
    await screen.findByTitle('Jellyfin');
    fireEvent.click(await screen.findByRole('button', { name: 'Restart app' }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === 'apps.restart')).toBe(true));
    expect(await screen.findAllByText('Restarting…')).not.toHaveLength(0);
    expect(screen.queryByTitle('Jellyfin')).toBeNull();
    await act(async () =>
      publish({
        id: '1',
        data: { type: 'app.stateChanged', data: { appId: 'jellyfin', state: 'running', detail: null } },
      }),
    );
    expect(await screen.findByTitle('Jellyfin')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('the status label follows app.stateChanged without reloading the page', async () => {
    let publish!: (event: unknown) => void;
    const event = new Promise((r) => (publish = r));
    open({ 'events.stream': () => event });
    await screen.findByText('Running');
    await act(async () =>
      publish({
        id: '1',
        data: { type: 'app.stateChanged', data: { appId: 'jellyfin', state: 'stopping', detail: null } },
      }),
    );
    expect(await screen.findAllByText('Stopping…')).not.toHaveLength(0);
  });

  it('Logs and App settings open over the window (D-096); Open in a new tab keeps the window', async () => {
    const openTab = vi.spyOn(browser, 'open').mockImplementation(() => {});
    const { router } = open({ 'apps.logs': () => ({ lines: [] }), 'apps.watchLogs': never });
    fireEvent.click(await screen.findByRole('button', { name: 'Open in a new tab' }));
    expect(openTab).toHaveBeenCalledWith('https://jellyfin.hlabs.local');
    expect(router.state.location.pathname).toBe('/apps/jellyfin');
    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
    expect(await screen.findByRole('dialog', { name: 'Jellyfin logs' })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ panel: 'logs' });
    await act(async () => router.history.back());
    fireEvent.click(await screen.findByRole('button', { name: 'App settings' }));
    expect(await screen.findByRole('dialog', { name: 'App settings' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/apps/jellyfin');
  });
});
