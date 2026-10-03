// US-USE-03 · Change the time range.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { RANGE_KEY, timeLabel } from './range';
import { UsagePage } from './usage-page';

const GIB = 1024 ** 3;
const point = (ts: number, cpu: number) => ({ ts, cpu, memBytes: 1, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 });
const history = (range: string, cpu: number[]) => ({
  scope: 'host',
  range,
  resolution: range === '1h' ? '5s' : range === '24h' ? '1m' : '1h',
  points: cpu.map((c, i) => point(Date.UTC(2026, 9, 3, 10, i), c)),
  peak: null,
});
const handlers = (slow24h = false) => ({
  'usage.overview': () => ({
    cpuModel: 'Apple M1',
    cores: 8,
    memTotalBytes: 16 * GIB,
    storage: null,
    engine: { kind: 'colima', running: true, cpus: 4, memoryBytes: 8 * GIB },
  }),
  'usage.current': () => null,
  'events.stream': () => new Promise(() => {}),
  'usage.history': (input: unknown) => {
    const { range } = input as { range: string };
    const data = history(range, range === '1h' ? [10, 20] : range === '24h' ? [30, 40, 50] : [60]);
    return slow24h && range === '24h' ? new Promise(() => {}) : data;
  },
});

describe('US-USE-03', () => {
  beforeEach(() => localStorage.clear());

  it('opens on 1 hour, with "CPU over the last hour"', async () => {
    renderScreen(UsagePage, handlers());
    expect(await screen.findByRole('radio', { name: '1 hour' })).toBeChecked();
    expect(await screen.findByText('CPU over the last hour', { selector: 'figcaption, h2' })).toBeInTheDocument();
  });

  it('24 hours and 7 days load their range, change the heading, and are remembered', async () => {
    const { calls } = renderScreen(UsagePage, handlers());
    fireEvent.click(await screen.findByRole('radio', { name: '24 hours' }));
    expect(await screen.findByText('CPU over the last 24 hours', { selector: 'figcaption, h2' })).toBeInTheDocument();
    expect(calls).toContainEqual({ path: 'usage.history', input: { scope: 'host', range: '24h' } });
    expect(localStorage.getItem(RANGE_KEY)).toBe('24h');
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }));
    expect(await screen.findByText('CPU over the last 7 days', { selector: 'figcaption, h2' })).toBeInTheDocument();
  });

  it('comes back on the range chosen last time', async () => {
    localStorage.setItem(RANGE_KEY, '7d');
    renderScreen(UsagePage, handlers());
    expect(await screen.findByRole('radio', { name: '7 days' })).toBeChecked();
    expect(await screen.findByText('CPU over the last 7 days', { selector: 'figcaption' })).toBeInTheDocument();
    expect(screen.queryByText('No usage recorded yet')).not.toBeInTheDocument();
  });

  it('keeps the previous chart, dimmed, while the new range loads', async () => {
    renderScreen(UsagePage, handlers(true));
    await screen.findByText('CPU over the last hour', { selector: 'figcaption, h2' });
    fireEvent.click(screen.getByRole('radio', { name: '24 hours' }));
    const chart = await screen.findByText('CPU over the last 24 hours', { selector: 'figcaption, h2' });
    const section = chart.closest('section')!;
    expect(section).toHaveAttribute('aria-busy', 'true');
    // The hour's points are still drawn while the day's load.
    expect(section.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows only the history there is, not zero-filled', async () => {
    renderScreen(UsagePage, handlers());
    fireEvent.click(await screen.findByRole('radio', { name: '7 days' }));
    await screen.findByText('CPU over the last 7 days', { selector: 'figcaption, h2' });
    await waitFor(() =>
      expect(
        screen
          .getByText('CPU over the last 7 days', { selector: 'figcaption, h2' })
          .closest('section')!
          .querySelectorAll('tbody tr'),
      ).toHaveLength(1),
    );
  });

  it('labels are local time; 7 days names the day', () => {
    const ts = new Date(2026, 9, 6, 14, 0).getTime();
    expect(timeLabel(ts, '1h')).toBe('14:00');
    expect(timeLabel(ts, '7d')).toMatch(/^\w{3} 14:00$/);
  });
});
