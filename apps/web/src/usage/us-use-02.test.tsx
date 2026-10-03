// US-USE-02 · Tiles update live and respect who may see them.
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonError, renderScreen } from '../test/render';
import { UsagePage } from './usage-page';

const GIB = 1024 ** 3;
const sample = (cpu: number, ts = 1) => ({
  ts,
  host: { cpu, memBytes: 9 * GIB, memTotalBytes: 16 * GIB, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 },
  apps: [],
});
const overview = () => ({
  cpuModel: 'Apple M1',
  cores: 8,
  memTotalBytes: 16 * GIB,
  storage: null,
  engine: { kind: 'colima', running: true, cpus: 4, memoryBytes: 8 * GIB },
});
const history = () => ({ scope: 'host', range: '1h', resolution: '5s', points: [], peak: null });
const later = <T,>(value: T, ms = 30) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

describe('US-USE-02', () => {
  afterEach(() => setVisibility('visible'));

  it('a usage.sample event updates the tiles in place', async () => {
    renderScreen(UsagePage, {
      'usage.overview': overview,
      'usage.history': history,
      'usage.current': () => sample(18),
      'events.stream': () => later({ id: 'e1', data: { type: 'usage.sample', data: sample(42, 2) } }),
    });
    expect(await screen.findByText('42%')).toBeInTheDocument();
    expect(screen.queryByText('18%')).not.toBeInTheDocument();
  });

  it('while the tab is hidden samples are ignored; showing it fetches usage.current once', async () => {
    setVisibility('hidden');
    const { calls } = renderScreen(UsagePage, {
      'usage.overview': overview,
      'usage.history': history,
      'usage.current': () => sample(18),
      'events.stream': () => later({ id: 'e1', data: { type: 'usage.sample', data: sample(42, 2) } }),
    });
    expect(await screen.findByText('18%')).toBeInTheDocument();
    await act(() => later(null, 80));
    expect(screen.queryByText('42%')).not.toBeInTheDocument();
    const before = calls.filter((c) => c.path === 'usage.current').length;
    setVisibility('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(calls.filter((c) => c.path === 'usage.current').length).toBe(before + 1));
  });

  it('a member who may not see usage gets "You don\'t have access to this"', async () => {
    renderScreen(UsagePage, {
      'usage.overview': () => {
        throw daemonError('ACCESS_DENIED');
      },
      'usage.current': () => {
        throw daemonError('ACCESS_DENIED');
      },
      'usage.history': history,
      'events.stream': () => new Promise(() => {}),
    });
    expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  });

  it('numbers use tabular figures and tiles are not live regions', async () => {
    renderScreen(UsagePage, {
      'usage.overview': overview,
      'usage.history': history,
      'usage.current': () => sample(18),
      'events.stream': () => new Promise(() => {}),
    });
    const value = await screen.findByText('18%');
    expect(value).toHaveClass('tabular-nums');
    expect(value.closest('[aria-live]')).toHaveAttribute('aria-live', 'off');
  });
});
