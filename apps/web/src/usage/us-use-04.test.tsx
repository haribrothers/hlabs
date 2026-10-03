// US-USE-04 · Read a metric's history and its peak.
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { timeLabel } from './range';
import { UsagePage } from './usage-page';

const GIB = 1024 ** 3;
const at = (i: number) => Date.UTC(2026, 9, 3, 10, i);
const point = (i: number, cpu: number) => ({
  ts: at(i),
  cpu,
  memBytes: (8 + i) * GIB,
  netRx: 1000 * (i + 1),
  netTx: 500,
  diskRead: 0,
  diskWrite: 0,
});
const handlers = (cpu: number[]) => ({
  'usage.overview': () => ({
    cpuModel: 'Apple M1',
    cores: 8,
    memTotalBytes: 16 * GIB,
    storage: { usedBytes: 114e9, totalBytes: 256e9, appsBytes: 0, filesBytes: 0, systemBytes: 114e9 },
    engine: { kind: 'colima', running: true, cpus: 4, memoryBytes: 8 * GIB },
  }),
  'usage.current': () => null,
  'events.stream': () => new Promise(() => {}),
  'usage.history': (input: unknown) => ({
    scope: 'host',
    range: (input as { range: string }).range,
    resolution: '5s',
    points: cpu.map((c, i) => point(i, c)),
    peak: null,
  }),
  'usage.memoryByApp': () => ({
    range: '1h',
    resolution: '5s',
    ts: [at(0), at(1)],
    series: ['Immich', 'Jellyfin', 'Paperless', 'Vaultwarden', 'Home Assistant'].map((name, i) => ({
      appId: name.toLowerCase(),
      name,
      values: [GIB / (i + 1), GIB / (i + 1)],
    })),
    other: [3 * GIB, 3 * GIB],
    peak: null,
  }),
});

const caption = () => document.querySelector('figcaption');

describe('US-USE-04', () => {
  beforeEach(() => localStorage.clear());

  it('opens on CPU with its peak in local time', async () => {
    renderScreen(UsagePage, handlers([10, 46, 20]));
    expect(await screen.findByText('Peak 46% at ' + timeLabel(at(1), '1h'))).toBeInTheDocument();
    expect(caption()).toHaveTextContent('CPU over the last hour');
    expect(screen.getByRole('button', { name: /^CPU/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a range of zeros peaks at 0%', async () => {
    renderScreen(UsagePage, handlers([0, 0]));
    expect(await screen.findByText(/^Peak 0% at /)).toBeInTheDocument();
  });

  it('for 7 days the peak names the day', async () => {
    localStorage.setItem('hlabs.usage.range', '7d');
    renderScreen(UsagePage, handlers([10, 61]));
    expect(await screen.findByText('Peak 61% on ' + timeLabel(at(1), '7d'))).toBeInTheDocument();
  });

  it('Network shows In and Out with a legend', async () => {
    renderScreen(UsagePage, handlers([10, 20]));
    fireEvent.click(await screen.findByRole('button', { name: /^Network/ }));
    expect(screen.getByRole('button', { name: /^Network/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^CPU/ })).toHaveAttribute('aria-pressed', 'false');
    expect(caption()).toHaveTextContent('Network over the last hour');
    expect(caption()).toHaveTextContent('Peak 2 KB/s in at');
    const legend = document.querySelector('.hl-chart-legend')!;
    expect(legend).toHaveTextContent('In');
    expect(legend).toHaveTextContent('Out');
  });

  it("Network's peak is out when out was higher", async () => {
    const h = handlers([10, 20]);
    const base = h['usage.history'];
    h['usage.history'] = (input: unknown) => {
      const r = base(input);
      return { ...r, points: r.points.map((p, i) => ({ ...p, netTx: i === 1 ? 750_000 : 0 })) };
    };
    renderScreen(UsagePage, h);
    fireEvent.click(await screen.findByRole('button', { name: /^Network/ }));
    expect(caption()).toHaveTextContent('Peak 750 KB/s out at ' + timeLabel(at(1), '1h'));
  });

  it('Memory shows the five apps using the most and Other, each named in the legend', async () => {
    const { calls } = renderScreen(UsagePage, handlers([10, 20]));
    fireEvent.click(await screen.findByRole('button', { name: /^Memory/ }));
    expect(await screen.findByText('Other', { selector: '.hl-chart-key' })).toBeInTheDocument();
    expect(calls).toContainEqual({ path: 'usage.memoryByApp', input: { range: '1h' } });
    const keys = [...document.querySelectorAll('.hl-chart-key')].map((k) => k.textContent);
    expect(keys).toEqual(['Immich', 'Jellyfin', 'Paperless', 'Vaultwarden', 'Home Assistant', 'Other']);
    const swatches = [...document.querySelectorAll('.hl-chart-key .hl-chart-swatch')] as HTMLElement[];
    expect(swatches.map((s) => s.style.background)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `var(--chart-${n})`));
    expect(caption()).toHaveTextContent('Peak 9 GB at');
  });

  it('Storage shows storage by use without a peak', async () => {
    renderScreen(UsagePage, handlers([10, 20]));
    fireEvent.click(await screen.findByRole('button', { name: /^Storage/ }));
    expect(caption()).toHaveTextContent('Storage by use');
    expect(caption()).not.toHaveTextContent('Peak');
    const legend = document.querySelector('.hl-chart-legend')!;
    for (const part of ['Apps', 'Files', 'System', 'Free']) expect(legend).toHaveTextContent(part);
  });
});
