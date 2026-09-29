// US-SYS-17 · See the container engine (server side).
import { afterEach, describe, expect, it } from 'vitest';
import { engineOverview, type EngineFacts } from '../src/engine/overview';
import type { EngineStatus } from '../src/engine/types';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const colima: EngineStatus = {
  state: 'running',
  candidate: { kind: 'colima', socketPath: '/h/.colima/hlabs/docker.sock', managedByHlabs: true },
  info: { version: '27.3.1', cpus: 4, memoryBytes: 8e9 },
};
const mac = (over: Partial<EngineFacts> = {}): EngineFacts => ({
  platform: 'darwin',
  status: colima,
  busy: false,
  installedApps: ['orbstack'],
  colimaInstalled: true,
  host: { cpus: 10, memoryBytes: 32 * 2 ** 30, freeDiskBytes: 500 * 2 ** 30 },
  colimaResources: null,
  ...over,
});

describe('US-SYS-17', () => {
  it('a Mac lists OrbStack, Docker Desktop and Colima: the active one, those found, those not installed', () => {
    expect(engineOverview(mac())).toEqual({
      platform: 'darwin',
      status: 'running',
      active: { kind: 'colima', managedByHlabs: true, version: '27.3.1' },
      resources: expect.objectContaining({ editable: true }),
      engines: [
        { kind: 'orbstack', availability: 'found' },
        { kind: 'docker-desktop', availability: 'notInstalled' },
        { kind: 'colima', availability: 'active' },
      ],
    });
  });

  it('while an install or restart runs it is "starting"; a stopped engine is stopped; none is missing', () => {
    expect(engineOverview(mac({ busy: true })).status).toBe('starting');
    expect(engineOverview(mac({ status: { state: 'stopped', candidate: colima.candidate } }))).toMatchObject({
      status: 'stopped',
      active: { kind: 'colima', version: null },
    });
    expect(engineOverview(mac({ status: { state: 'missing' }, colimaInstalled: false }))).toMatchObject({
      status: 'missing',
      active: null,
      engines: [
        { kind: 'orbstack', availability: 'found' },
        { kind: 'docker-desktop', availability: 'notInstalled' },
        { kind: 'colima', availability: 'notInstalled' },
      ],
    });
  });

  it('Linux lists Docker Engine only: the Mac engines are hidden', () => {
    const status: EngineStatus = {
      state: 'running',
      candidate: { kind: 'docker-engine', socketPath: '/var/run/docker.sock', managedByHlabs: false },
      info: { version: '27.0.0', cpus: 8, memoryBytes: 16e9 },
    };
    expect(engineOverview(mac({ platform: 'linux', status, installedApps: [] })).engines).toEqual([
      { kind: 'docker-engine', availability: 'active' },
    ]);
  });

  it('settings.engine.get answers for an admin', async () => {
    const d = await daemonWithAdmin(closers);
    const data = (await d.query('settings.engine.get')).result!.data as { platform: string; engines: unknown[] };
    expect(['darwin', 'linux']).toContain(data.platform);
    expect(data.engines.length).toBeGreaterThan(0);
  });
});
