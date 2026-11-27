// US-APP-20 · Resource use tiles and 24-hour chart.
import type * as Shared from '@hlabs/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeMe } from '../test/me';
import { renderScreen } from '../test/render';
import { appDetail } from '../test/store';
import { AppSettings } from './app-settings';
import { AppUsage, BUCKET_MS, bucketize, CHART_REFRESH_MS, dayTicks } from './app-usage';

// The Usage tab ships in phase 7 (D-036).
vi.mock('@hlabs/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof Shared>();
  return { ...shared, isFeatureEnabled: (f: never, p = 7) => shared.isFeatureEnabled(f, p) };
});

const MB = 1e6;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const never = () => new Promise(() => {});
const later = <T,>(value: T, ms = 30) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

const app = appDetail({ id: 'vaultwarden', name: 'Vaultwarden', state: 'running', services: ['server'] });
const current = { appId: 'vaultwarden', cpu: 1, memBytes: 64 * MB, netRx: 1000, netTx: 0, diskRead: 0, diskWrite: 0 };
const detail = (over: Record<string, unknown> = {}) => ({
  appId: 'vaultwarden',
  installedAt: Date.now() - 6 * 24 * HOUR,
  current,
  cpuAvgToday: 0.4,
  memPeak24h: 91 * MB,
  disk: { dataBytes: 160 * MB, imageBytes: 50 * MB },
  containers: [],
  ...over,
});
const point = (ts: number, memBytes: number) => ({
  ts,
  cpu: 1,
  memBytes,
  netRx: 2000,
  netTx: 500,
  diskRead: 0,
  diskWrite: 0,
});
/** One point a minute for the last `hours`, skipping `gap` (minutes ago, [from, to)). */
function history(hours = 24, gap?: [number, number]) {
  const now = Math.floor(Date.now() / MINUTE) * MINUTE;
  const points = [];
  for (let m = hours * 60; m >= 1; m--) {
    if (gap && m >= gap[0] && m < gap[1]) continue;
    points.push(point(now - m * MINUTE, 64 * MB));
  }
  return { scope: 'vaultwarden', range: '24h', resolution: '1m', points, peak: null };
}

function open(handlers: Record<string, (input: unknown) => unknown> = {}, onOpenLogs = vi.fn()) {
  return {
    onOpenLogs,
    ...renderScreen(() => <AppUsage app={app} onOpenLogs={onOpenLogs} />, {
      'usage.appDetail': () => detail(),
      'usage.history': () => history(),
      'events.stream': never,
      ...handlers,
    }),
  };
}
const tiles = async () => within(await screen.findByRole('group', { name: 'Resource use' }));

describe('US-APP-20', () => {
  afterEach(() => vi.useRealTimers());

  it('three tiles show CPU with today’s average, memory with its 24-hour peak and disk as data plus image', async () => {
    open();
    const t = await tiles();
    expect(await t.findByText('1%')).toBeInTheDocument();
    expect(t.getByText('avg 0.4% today')).toBeInTheDocument();
    expect(t.getByText('64 MB')).toBeInTheDocument();
    expect(t.getByText('peak 91 MB')).toBeInTheDocument();
    expect(t.getByText('210 MB')).toBeInTheDocument();
    expect(t.getByText('data + image')).toBeInTheDocument();
  });

  it('the Usage tab of App settings shows it', async () => {
    renderScreen(
      () => <AppSettings appId="vaultwarden" />,
      {
        'apps.get': () => app,
        'usage.appDetail': () => detail(),
        'usage.history': () => history(),
        'events.stream': never,
        'auth.me': fakeMe({ role: 'admin' }),
      },
      { path: '/apps/vaultwarden/settings' },
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Usage' }));
    expect(await screen.findByRole('group', { name: 'Resource use' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restart/ })).not.toBeInTheDocument();
  });

  it('the chart is "Memory · last 24 hours" in MB by default, labelled every 6 hours to "now"; a Segmented switches it', async () => {
    const { calls } = open();
    const chart = await screen.findByText('Memory · last 24 hours', { selector: 'figcaption' });
    expect(chart.textContent).toContain('MB');
    expect(calls).toContainEqual({ path: 'usage.history', input: { scope: 'vaultwarden', range: '24h' } });
    expect(screen.getByRole('radio', { name: 'Memory' })).toBeChecked();
    const figure = chart.closest('figure')!;
    const axis = [...figure.querySelectorAll('text.hl-chart-axis')].map((t) => t.textContent);
    expect(axis.at(-1)).toBe('now');
    expect(axis.filter((t) => /^(00|06|12|18):00$/.test(t ?? ''))).toHaveLength(
      dayTicks(bucketize([], Date.now(), () => null).starts, Date.now()).length - 1,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'CPU' }));
    expect(await screen.findByText('CPU · last 24 hours', { selector: 'figcaption' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Network' }));
    const net = await screen.findByText('Network · last 24 hours', { selector: 'figcaption' });
    expect(net.textContent).toContain('KB/s');
    // In and out: two lines with a legend.
    const figureNet = net.closest('figure')!;
    expect(figureNet.querySelectorAll('path.hl-chart-line')).toHaveLength(2);
    const legend = figureNet.querySelector('.hl-chart-legend') as HTMLElement;
    expect(legend.textContent).toBe('InOut');
  });

  it('the tiles follow usage.sample', async () => {
    const next = { ...current, cpu: 42, memBytes: 80 * MB };
    let sent = false;
    open({
      // As the daemon: usage.appDetail's current is the latest sample.
      'usage.appDetail': () => detail({ current: sent ? next : current }),
      'events.stream': () =>
        later({ id: 'e1', data: { type: 'usage.sample', data: { ts: 2, host: {}, apps: [next] } } }).then((event) => {
          sent = true;
          return event;
        }),
    });
    const t = await tiles();
    expect(await t.findByText('1%')).toBeInTheDocument();
    expect(await t.findByText('42%')).toBeInTheDocument();
    expect(t.getByText('80 MB')).toBeInTheDocument();
  });

  it('asks for the history again each minute, so the last point moves on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { calls } = open();
    await screen.findByText('Memory · last 24 hours', { selector: 'figcaption' });
    const before = calls.filter((c) => c.path === 'usage.history').length;
    await act(() => vi.advanceTimersByTimeAsync(CHART_REFRESH_MS));
    await waitFor(() => expect(calls.filter((c) => c.path === 'usage.history').length).toBe(before + 1));
  });

  it('the line has a gap while the app was stopped', async () => {
    open({ 'usage.history': () => history(24, [120, 240]) });
    const chart = await screen.findByText('Memory · last 24 hours', { selector: 'figcaption' });
    const d = chart.closest('figure')!.querySelector('path.hl-chart-line')!.getAttribute('d')!;
    expect(d.match(/M/g)).toHaveLength(2);
    // The hidden table says there's nothing for that time.
    expect(within(chart.closest('figure')!).getAllByText('No data').length).toBeGreaterThanOrEqual(
      (2 * HOUR) / BUCKET_MS - 1,
    );
  });

  it('an app installed under 10 minutes ago says it is collecting data', async () => {
    open({
      'usage.appDetail': () => detail({ installedAt: Date.now() - 4 * MINUTE }),
      'usage.history': () => history(0),
    });
    expect(await screen.findByText('Collecting data — check back in a few minutes.')).toBeInTheDocument();
  });

  it('a focused point shows its time and value; the chart has a text summary', async () => {
    open();
    const chart = await screen.findByText('Memory · last 24 hours', { selector: 'figcaption' });
    const figure = chart.closest('figure')!;
    const svg = figure.querySelector('svg')!;
    act(() => svg.focus());
    fireEvent.keyDown(svg, { key: 'End' });
    const tip = figure.querySelector('.hl-chart-tip')!;
    expect(tip.textContent).toContain('64 MB');
    expect(within(figure).getByRole('status').textContent).toMatch(/^\d\d:\d\d, Memory 64 MB$/);
    expect(
      screen.getByText(/Memory over the last 24 hours: average 64 MB, highest 64 MB at \d\d:\d\d\./),
    ).toBeInTheDocument();
  });
});
