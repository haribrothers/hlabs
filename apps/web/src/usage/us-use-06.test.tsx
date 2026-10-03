// US-USE-06 · Sort the per-app table.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeApp } from '../home/home-app';
import { renderScreen } from '../test/render';
import { AppTable, ORDER_EVERY_MS } from './app-table';
import { SORT_KEY } from './sort';
import { UsagePage } from './usage-page';

const GB = 1024 ** 3;
const MB = 1000 ** 2;
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
const usage = (appId: string, cpu: number, memBytes: number, netRx: number, netTx: number) => ({
  appId,
  cpu,
  memBytes,
  netRx,
  netTx,
  diskRead: 0,
  diskWrite: 0,
});
const sample = (apps: ReturnType<typeof usage>[]) => ({
  ts: 1,
  host: { cpu: 18, memBytes: 9 * GB, memTotalBytes: 16 * GB, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 },
  apps,
});
const APPS = [app('immich', 'Immich'), app('jellyfin', 'Jellyfin'), app('vault', 'Vaultwarden')];
const SAMPLE = sample([
  usage('immich', 7.2, 1.8 * GB, 1.0 * MB, 0.4 * MB),
  usage('jellyfin', 4.1, 1.1 * GB, 0.5 * MB, 0.1 * MB),
  usage('vault', 0.1, 64 * MB, 600, 400),
]);

const handlers = () => ({
  'usage.overview': () => ({
    cpuModel: 'Apple M1',
    cores: 8,
    memTotalBytes: 16 * GB,
    storage: null,
    engine: { kind: 'colima', running: true, cpus: 4, memoryBytes: 8 * GB },
  }),
  'usage.current': () => SAMPLE,
  'usage.history': () => ({ scope: 'host', range: '1h', resolution: '5s', points: [], peak: null }),
  'apps.list': () => ({ apps: APPS }),
  'events.stream': () => new Promise(() => {}),
});

const table = async () => screen.findByRole('table', { name: 'Apps' });
// The name beside each logo (the logo's letter is decorative).
const names = (t: HTMLElement) =>
  within(t)
    .getAllByRole('rowheader')
    .map((r) => r.querySelector('.truncate')!.textContent);
const header = (t: HTMLElement, name: string) => within(t).getByRole('columnheader', { name: new RegExp(`^${name}`) });

describe('US-USE-06', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('shows App, CPU, Memory, Network and Status, one row per app', async () => {
    renderScreen(UsagePage, handlers());
    const t = await table();
    expect(
      within(t)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['App', 'CPU', 'Memory↓', 'Network', 'Status']);
    const immich = (await within(t).findByRole('rowheader', { name: 'Immich' })).closest('tr')!;
    // CPU is the app's share of the whole computer; network is in + out.
    expect(
      within(immich)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['7.2%', '1.8 GB', '1.4 MB/s', 'Running']);
  });

  it('opens sorted by memory, most first', async () => {
    renderScreen(UsagePage, handlers());
    const t = await table();
    await within(t).findByText('1.8 GB');
    expect(names(t)).toEqual(['Immich', 'Jellyfin', 'Vaultwarden']);
    expect(header(t, 'Memory')).toHaveAttribute('aria-sort', 'descending');
  });

  it('a header sorts most first, again least first; App and Status A–Z first; the choice is remembered', async () => {
    const { unmount } = renderScreen(UsagePage, handlers());
    const t = await table();
    await within(t).findByText('1.8 GB');
    fireEvent.click(within(t).getByRole('button', { name: 'Network' }));
    expect(header(t, 'Network')).toHaveAttribute('aria-sort', 'descending');
    expect(header(t, 'Network')).toHaveTextContent('Network↓');
    expect(header(t, 'Memory')).not.toHaveAttribute('aria-sort');
    expect(names(t)).toEqual(['Immich', 'Jellyfin', 'Vaultwarden']);
    fireEvent.click(within(t).getByRole('button', { name: 'Network' }));
    expect(header(t, 'Network')).toHaveAttribute('aria-sort', 'ascending');
    expect(names(t)).toEqual(['Vaultwarden', 'Jellyfin', 'Immich']);
    fireEvent.click(within(t).getByRole('button', { name: 'App' }));
    expect(header(t, 'App')).toHaveAttribute('aria-sort', 'ascending');
    expect(names(t)).toEqual(['Immich', 'Jellyfin', 'Vaultwarden']);
    fireEvent.click(within(t).getByRole('button', { name: 'Status' }));
    expect(header(t, 'Status')).toHaveAttribute('aria-sort', 'ascending');
    expect(JSON.parse(localStorage.getItem(SORT_KEY)!)).toEqual({ column: 'status', dir: 'asc' });
    unmount();
    renderScreen(UsagePage, handlers());
    expect(header(await table(), 'Status')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('live values update at once, but the order only every 10 s', () => {
    vi.useFakeTimers();
    const { rerender } = render(<AppTable apps={APPS} current={SAMPLE} />);
    const t = screen.getByRole('table');
    expect(names(t)).toEqual(['Immich', 'Jellyfin', 'Vaultwarden']);
    const swapped = sample([
      usage('immich', 7.2, 0.5 * GB, 0, 0),
      usage('jellyfin', 4.1, 1.1 * GB, 0, 0),
      usage('vault', 0.1, 3 * GB, 0, 0),
    ]);
    rerender(<AppTable apps={APPS} current={swapped} />);
    expect(within(t).getByText('3 GB')).toBeInTheDocument();
    expect(names(t)).toEqual(['Immich', 'Jellyfin', 'Vaultwarden']);
    act(() => vi.advanceTimersByTime(ORDER_EVERY_MS));
    expect(names(t)).toEqual(['Vaultwarden', 'Jellyfin', 'Immich']);
  });

  it('on a phone, only App, the sorted column and Status show', async () => {
    render(<AppTable apps={APPS} current={SAMPLE} />);
    const t = screen.getByRole('table');
    const hidden = (name: string) => header(t, name).className.includes('max-md:hidden');
    expect(['App', 'CPU', 'Memory', 'Network', 'Status'].map(hidden)).toEqual([false, true, false, true, false]);
    fireEvent.click(within(t).getByRole('button', { name: 'CPU' }));
    expect(['CPU', 'Memory'].map(hidden)).toEqual([false, true]);
  });
});
