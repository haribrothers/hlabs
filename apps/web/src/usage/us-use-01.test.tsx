// US-USE-01 · See host CPU, memory, storage and network at a glance.
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../test/render';
import { engineLine, UsagePage } from './usage-page';

const GIB = 1024 ** 3;
const overview = (engine: object = {}) => ({
  cpuModel: 'Apple M1',
  cores: 8,
  memTotalBytes: 16 * GIB,
  storage: { usedBytes: 114e9, totalBytes: 256e9 },
  engine: { kind: 'colima', running: true, cpus: 4, memoryBytes: 8 * GIB, ...engine },
});
const current = (host: object = {}) => ({
  ts: 1,
  host: {
    cpu: 18.2,
    memBytes: 9.4 * GIB,
    memTotalBytes: 16 * GIB,
    netRx: 2.1e6,
    netTx: 3e5,
    diskRead: 0,
    diskWrite: 0,
    ...host,
  },
  apps: [
    { appId: 'immich', cpu: 7, memBytes: 3 * GIB, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 },
    { appId: 'jellyfin', cpu: 4, memBytes: 2.1 * GIB, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 },
  ],
});
const history = (cpu: number[] = [10, 12, 18]) => ({
  scope: 'host',
  range: '1h',
  resolution: '5s',
  points: cpu.map((c, i) => ({ ts: i, cpu: c, memBytes: 9e9, netRx: 1, netTx: 1, diskRead: 0, diskWrite: 0 })),
  peak: null,
});

function render(opts: { host?: object; engine?: object; cpu?: number[] } = {}) {
  return renderScreen(UsagePage, {
    'usage.overview': () => overview(opts.engine),
    'usage.current': () => current(opts.host),
    'usage.history': () => history(opts.cpu),
  });
}

describe('US-USE-01', () => {
  it('shows the title, the engine, the time range and the four tiles', async () => {
    render();
    expect(await screen.findByRole('heading', { level: 1, name: 'Live usage' })).toBeInTheDocument();
    expect(await screen.findByText('Container VM (Colima) · 4 CPUs · 8 GB allocated')).toBeInTheDocument();
    const range = screen.getByRole('radiogroup', { name: 'Time range' });
    expect(
      within(range)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['1 hour', '24 hours', '7 days']);
    expect(await screen.findByText('18%')).toBeInTheDocument();
    expect(screen.getByText('Apple M1 · 8 cores')).toBeInTheDocument();
    expect(screen.getByText('9.4 GB')).toBeInTheDocument();
    expect(screen.getByText('of 16 GB · 5.1 GB by apps')).toBeInTheDocument();
    expect(screen.getByText('114 GB')).toBeInTheDocument();
    expect(screen.getByText('of 256 GB used')).toBeInTheDocument();
    expect(screen.getByText('2.1 MB/s')).toBeInTheDocument();
    expect(screen.getByText('↓ in · 300 KB/s ↑ out')).toBeInTheDocument();
  });

  it('no traffic reads 0 KB/s', async () => {
    render({ host: { netRx: 0, netTx: 0 } });
    expect(await screen.findByText('0 KB/s')).toBeInTheDocument();
  });

  it('says "High" in words when CPU is 90% or more for 3 samples, or memory is 90% of the total', async () => {
    render({ cpu: [50, 91, 95, 93], host: { cpu: 93 } });
    expect(await screen.findAllByText('High')).toHaveLength(1);
  });

  it('two high CPU samples are not yet "High"; memory near full is', async () => {
    render({ cpu: [50, 91, 95], host: { cpu: 95, memBytes: 15 * GIB } });
    await screen.findByText('95%');
    expect(screen.getAllByText('High')).toHaveLength(1);
  });

  it('names the engine and what it may use', () => {
    expect(engineLine({ kind: 'docker-engine', running: true, cpus: 8, memoryBytes: 1 })).toBe(
      'Docker Engine · uses the whole computer',
    );
    expect(engineLine({ kind: 'orbstack', running: true, cpus: 8, memoryBytes: 16 * GIB })).toBe(
      'OrbStack · 8 CPUs · 16 GB allocated',
    );
    expect(engineLine({ kind: 'colima', running: false, cpus: null, memoryBytes: null })).toBe(
      'Container engine stopped',
    );
  });
});
