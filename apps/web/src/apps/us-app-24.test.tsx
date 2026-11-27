// US-APP-24 · Offer to reinstall a broken app: Restart and Reinstall… where a broken app takes you (its Logs, App
// settings, its tile's menu), a quiet Reinstall… for a working app, "Reinstall <App>?" saying what's kept, the
// reinstall's progress, and why it waits when it can't run. Admins only.
import type { AppDetail, AppState, Job } from '@hlabs/api';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppGrid, type HomeApp } from '../home/app-grid';
import { HomeView } from '../home/home-view';
import { fakeMe } from '../test/me';
import { renderScreen, type Handlers } from '../test/render';
import { appDetail } from '../test/store';
import { AppLogs } from './app-logs';
import { AppSettings } from './app-settings';
import { AppWindow } from './app-window';

const never = () => new Promise(() => {});
const CRASHED = { code: 'APP_CRASHED', service: 'uptime-kuma', exitCode: 1, oom: false, loop: false };

function kuma(state: AppState, extra: Partial<AppDetail> = {}): AppDetail {
  return appDetail({
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    state,
    version: '1.23.16',
    engineRunning: true,
    stateDetail: state === 'error' ? CRASHED : null,
    reinstall: { version: '1.23.16', downloadBytes: 420_000_000, blocked: null },
    ...extra,
  });
}

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j1',
  kind: 'app_reinstall',
  target: 'uptime-kuma',
  state: 'running',
  progress: 42,
  message: JSON.stringify({ step: 'pulling' }),
  hlabsCode: null,
  createdAt: 1,
  finishedAt: null,
  ...over,
});

function settings(app: AppDetail, handlers: Handlers = {}, jobs: Job[] = []) {
  return renderScreen(
    () => <AppSettings appId="uptime-kuma" />,
    {
      'apps.get': () => ({ ...app }),
      'events.stream': never,
      'auth.me': fakeMe({ role: 'admin' }),
      'jobs.list': () => ({ items: jobs }),
      ...handlers,
    },
    { path: '/apps/uptime-kuma/settings' },
  );
}

describe('US-APP-24', () => {
  it("a broken app's Logs offer Restart and Reinstall…, and say its data is kept either way", async () => {
    renderScreen(
      () => <AppLogs appId="uptime-kuma" />,
      {
        'apps.get': () => kuma('error'),
        'apps.logs': () => ({ lines: [] }),
        'apps.watchLogs': never,
        'events.stream': never,
        'system.info': never,
        'jobs.list': () => ({ items: [] }),
        'auth.me': fakeMe({ role: 'admin' }),
      },
      { path: '/apps/uptime-kuma/logs' },
    );
    const card = (await screen.findByText('Uptime Kuma stopped working')).closest('[role="status"]') as HTMLElement;
    expect(card).toHaveTextContent("Restart it, or reinstall it if that doesn't help. Its data is kept either way.");
    expect(within(card).getByRole('button', { name: 'Restart' })).toBeEnabled();
    expect(await within(card).findByRole('button', { name: 'Reinstall…' })).toBeEnabled();
  });

  it('App settings of a broken app: "Stopped working · it quit unexpectedly", then Restart, Reinstall… and Logs', async () => {
    settings(kuma('error'));
    expect(await screen.findByText('Stopped working · it quit unexpectedly')).toBeInTheDocument();
    const restart = screen.getByRole('button', { name: 'Restart' });
    expect(restart).not.toHaveClass('hl-btn-secondary'); // the white primary
    expect(screen.getByRole('button', { name: 'Reinstall…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it.each(['running', 'stopped'] as const)('a %s app has a quiet Reinstall… beside Uninstall…', async (state) => {
    settings(kuma(state));
    const uninstall = await screen.findByRole('button', { name: 'Uninstall…' });
    const footer = uninstall.closest('footer') as HTMLElement;
    expect(within(footer).getByRole('button', { name: 'Reinstall…' })).toBeEnabled();
  });

  it('"Reinstall <App>?" says what is downloaded again and what is kept; Reinstall starts it', async () => {
    const calls: unknown[] = [];
    settings(kuma('running'), { 'apps.reinstall': (input) => (calls.push(input), { jobId: 'j1' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Reinstall…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reinstall Uptime Kuma?' });
    expect(dialog).toHaveTextContent(
      'hlabs downloads Uptime Kuma 1.23.16 again (about 420 MB) and sets it up from scratch.',
    );
    expect(within(dialog).getByText('Kept as they are')).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Its data and settings',
      'Passwords it created',
      'Folder access and who it’s shared with',
      'Its place on Home and in the Dock',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(dialog).queryByText('It starts when it’s done.')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reinstall' }));
    await waitFor(() => expect(calls).toEqual([{ appId: 'uptime-kuma' }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('for a stopped app the dialog adds "It starts when it’s done."; Cancel changes nothing', async () => {
    const calls: unknown[] = [];
    settings(kuma('stopped'), { 'apps.reinstall': (input) => (calls.push(input), { jobId: 'j1' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Reinstall…' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('It starts when it’s done.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls).toEqual([]);
  });

  it('without its saved settings the dialog says why and offers only Cancel', async () => {
    settings(kuma('error', { reinstall: { version: '1.23.16', downloadBytes: null, blocked: 'settings_missing' } }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reinstall…' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      "hlabs can't find Uptime Kuma's saved settings, so reinstalling would reset its passwords. To start over, uninstall it and install it again.",
    );
    expect(within(dialog).queryByRole('button', { name: 'Reinstall' })).toBeNull();
  });

  it.each([
    ['the engine is stopped', kuma('error', { engineRunning: false }), [], 'Start the container engine first'],
    [
      'apps are paused',
      kuma('stopped', { reinstall: { version: '1.23.16', downloadBytes: null, blocked: 'paused' } }),
      [],
      'Resume apps first',
    ],
    [
      'hlabs is restoring a backup',
      kuma('error'),
      [job({ kind: 'restore', target: null })],
      'Wait for the restore to finish',
    ],
  ])('Reinstall… waits while %s', async (_why, app, jobs, title) => {
    settings(app, {}, jobs as Job[]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reinstall…' })).toHaveAttribute('title', title));
    expect(screen.getByRole('button', { name: 'Reinstall…' })).toBeDisabled();
  });

  it('while it reinstalls: the step and how far, Open, Restart, Stop, Reinstall… and Uninstall… wait, Logs still opens', async () => {
    settings(kuma('reinstalling'), {}, [job()]);
    expect(await screen.findByText('Downloading Uptime Kuma 1.23.16')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Downloading Uptime Kuma 1.23.16' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );
    for (const name of ['Open', 'Restart', 'Stop', 'Reinstall…', 'Uninstall…']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Logs' })).toBeEnabled();
  });

  it('a broken tile’s menu has Reinstall… after Restart, which opens the dialog', async () => {
    const tile: HomeApp = {
      id: 'uptime-kuma',
      name: 'Uptime Kuma',
      state: 'error',
      icon: { logoUrl: null, gradient: null, fallback: null },
      embed: false,
      ownLogin: false,
      urls: { local: 'https://uptime-kuma.hlabs.local', tailnet: null, port: null },
    };
    renderScreen(() => <HomeView />, {
      'auth.me': fakeMe({ role: 'admin' }),
      'home.getLayout': () => ({ items: [], dock: [] }),
      'apps.list': () => ({ apps: [tile] }),
      'apps.get': () => kuma('error'),
      'jobs.list': () => ({ items: [] }),
      'events.stream': never,
    });
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Uptime Kuma, error' }, { timeout: 5_000 }));
    const menu = await screen.findByRole('menu');
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toEqual(['Open', 'Settings', 'View logs', 'Restart', 'Reinstall…', 'Uninstall…', 'Edit Home']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reinstall…' }));
    expect(await screen.findByRole('dialog', { name: 'Reinstall Uptime Kuma?' })).toBeInTheDocument();
  });

  it('a reinstalling tile fills its ring: "Reinstalling… 42%"', async () => {
    renderScreen(
      () => (
        <AppGrid
          apps={[
            {
              id: 'nextcloud',
              name: 'Nextcloud',
              state: 'reinstalling',
              icon: { logoUrl: null, gradient: null, fallback: null },
              embed: false,
              ownLogin: false,
              urls: { local: 'https://nextcloud.hlabs.local', tailnet: null, port: null },
            },
          ]}
          isAdmin
          progress={new Map([['nextcloud', 42]])}
        />
      ),
      {},
    );
    expect(await screen.findByRole('button', { name: 'Nextcloud, reinstalling, 42%' })).toHaveTextContent(
      'Reinstalling… 42%',
    );
  });

  it('someone opening the app while it reinstalls sees "<App> is being reinstalled"', async () => {
    renderScreen(
      () => <AppWindow appId="uptime-kuma" />,
      {
        'apps.get': () => kuma('reinstalling', { embed: true }),
        'events.stream': never,
        'auth.me': fakeMe({ role: 'member' }),
      },
      { path: '/apps/uptime-kuma' },
    );
    expect(await screen.findByText('Uptime Kuma is being reinstalled')).toBeInTheDocument();
  });

  it('members never see Reinstall…', async () => {
    renderScreen(
      () => <AppLogs appId="uptime-kuma" />,
      {
        'apps.get': () => kuma('error', { reinstall: null }),
        'apps.logs': () => ({ lines: [] }),
        'apps.watchLogs': never,
        'events.stream': never,
        'system.info': never,
        'auth.me': fakeMe({ role: 'member' }),
      },
      { path: '/apps/uptime-kuma/logs' },
    );
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reinstall…' })).toBeNull());
  });
});
