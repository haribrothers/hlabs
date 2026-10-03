// US-USE-07 · See stopped and failing apps in the table.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HomeApp } from '../home/home-app';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { AppTable } from './app-table';
import { UsagePage } from './usage-page';

const GB = 1024 ** 3;
const app = (id: string, name: string, state = 'running') =>
  ({
    id,
    name,
    state,
    icon: { logoUrl: null, gradient: null, fallback: null },
    embed: false,
    ownLogin: false,
    urls: { local: `https://${id}.hlabs.local`, tailnet: null, port: null },
  }) as HomeApp;
const usage = (appId: string, memBytes: number) => ({
  appId,
  cpu: 1,
  memBytes,
  netRx: 10,
  netTx: 10,
  diskRead: 0,
  diskWrite: 0,
});
const sample = (apps: ReturnType<typeof usage>[]) => ({
  ts: 1,
  host: { cpu: 18, memBytes: 9 * GB, memTotalBytes: 16 * GB, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 },
  apps,
});

const base = (apps: () => { apps: HomeApp[] }, extra: Record<string, unknown> = {}) => ({
  'usage.overview': () => ({
    cpuModel: 'Apple M1',
    cores: 8,
    memTotalBytes: 16 * GB,
    storage: null,
    engine: { kind: 'colima', running: true, cpus: 4, memoryBytes: 8 * GB },
  }),
  'usage.current': () => sample([usage('immich', 2 * GB), usage('jellyfin', 1 * GB)]),
  'usage.history': () => ({ scope: 'host', range: '1h', resolution: '5s', points: [], peak: null }),
  'apps.list': apps,
  'auth.me': fakeMe(),
  'events.stream': () => new Promise(() => {}),
  ...extra,
});

// The name beside each logo (the logo's letter is decorative).
const names = (t: HTMLElement) =>
  within(t)
    .getAllByRole('rowheader')
    .map((r) => r.querySelector('.truncate')!.textContent);
const row = (t: HTMLElement, name: string) => within(t).getByRole('rowheader', { name }).closest('tr')!;

describe('US-USE-07', () => {
  beforeEach(() => localStorage.clear());

  it('a running app says Running with a green dot', () => {
    render(<AppTable apps={[app('immich', 'Immich')]} current={sample([usage('immich', GB)])} />);
    const status = within(row(screen.getByRole('table'), 'Immich')).getByText('Running');
    expect(status).toHaveClass('hl-status-running');
  });

  it('a stopped app shows "—" and Stopped, and sorts below running apps whichever way', () => {
    const apps = [app('immich', 'Immich'), app('paper', 'Paperless', 'stopped'), app('jellyfin', 'Jellyfin')];
    // A stopped app's last numbers in a sample are not shown.
    const current = sample([usage('immich', 2 * GB), usage('jellyfin', 1 * GB), usage('paper', 5 * GB)]);
    render(<AppTable apps={apps} current={current} />);
    const t = screen.getByRole('table');
    const paper = row(t, 'Paperless');
    expect(
      within(paper)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['—', '—', '—', 'Stopped']);
    expect(within(paper).getByText('Stopped')).toHaveClass('hl-status-stopped');
    expect(names(t)).toEqual(['Immich', 'Jellyfin', 'Paperless']);
    fireEvent.click(within(t).getByRole('button', { name: 'Memory' }));
    expect(names(t)).toEqual(['Jellyfin', 'Immich', 'Paperless']);
    fireEvent.click(within(t).getByRole('button', { name: 'App' }));
    expect(names(t)).toEqual(['Immich', 'Jellyfin', 'Paperless']);
    fireEvent.click(within(t).getByRole('button', { name: 'App' }));
    expect(names(t)).toEqual(['Jellyfin', 'Immich', 'Paperless']);
  });

  it('error, starting, updating and restarting say so with the matching dot', () => {
    const apps = [
      app('a', 'Alpha', 'error'),
      app('b', 'Bravo', 'starting'),
      app('c', 'Charlie', 'updating'),
      app('d', 'Delta', 'restarting'),
    ];
    render(<AppTable apps={apps} current={null} />);
    const t = screen.getByRole('table');
    const status = (name: string) => within(row(t, name)).getAllByRole('cell').at(-1)!.firstElementChild!;
    expect(status('Alpha')).toHaveTextContent('Error');
    expect(status('Alpha')).toHaveClass('hl-status-failed');
    for (const [name, text] of [
      ['Bravo', 'Starting'],
      ['Charlie', 'Updating'],
      ['Delta', 'Restarting'],
    ] as const) {
      expect(status(name)).toHaveTextContent(text);
      expect(status(name)).toHaveClass('hl-status-working');
    }
  });

  it('with no apps: "No apps yet" and "Browse the App Store"', async () => {
    renderScreen(
      UsagePage,
      base(() => ({ apps: [] })),
      { path: '/usage' },
    );
    expect(await screen.findByRole('heading', { name: 'No apps yet' })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Apps' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Browse the App Store' }));
    expect(await screen.findByText('elsewhere')).toBeInTheDocument();
  });

  it('someone who may not install apps gets no store button', async () => {
    renderScreen(
      UsagePage,
      base(() => ({ apps: [] }), { 'auth.me': fakeMe({ role: 'member', canInstallApps: false }) }),
      {
        path: '/usage',
      },
    );
    expect(await screen.findByRole('heading', { name: 'No apps yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Browse the App Store' })).toBeNull();
  });

  it('a member sees only the apps listed for them, even if a sample had more', async () => {
    renderScreen(
      UsagePage,
      base(() => ({ apps: [app('immich', 'Immich')] })),
      { path: '/usage' },
    );
    const t = await screen.findByRole('table', { name: 'Apps' });
    expect(names(t)).toEqual(['Immich']);
  });

  it('an app uninstalled while the page is open goes on the next app.stateChanged', async () => {
    let lists = 0;
    // The event goes out only once the page shows Jellyfin, however slow the machine is.
    let send!: (event: unknown) => void;
    renderScreen(
      UsagePage,
      base(
        () => ({
          apps: lists++ === 0 ? [app('immich', 'Immich'), app('jellyfin', 'Jellyfin')] : [app('immich', 'Immich')],
        }),
        { 'events.stream': () => new Promise((resolve) => (send = resolve)) },
      ),
      { path: '/usage' },
    );
    const t = await screen.findByRole('table', { name: 'Apps' });
    expect(await within(t).findByRole('rowheader', { name: 'Jellyfin' })).toBeInTheDocument();
    await waitFor(() => expect(send).toBeDefined());
    send({
      id: 'e1',
      data: { type: 'app.stateChanged', data: { appId: 'jellyfin', state: 'uninstalling', detail: null } },
    });
    await expect.poll(() => names(t), { timeout: 5000 }).toEqual(['Immich']);
  });
});
