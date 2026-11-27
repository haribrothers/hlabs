// US-APP-21 · Per-container usage (server side): the sampler keeps each container's last reading, and usage.appDetail
// lists every compose service's container with its name, status, memory, CPU and download rate.
import type { AppUsageDetail } from '@hlabs/api';
import { apps } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContainerState } from '../src/engine/types';
import { containerStatus } from '../src/usage/app-detail';
import { SAMPLE_MS } from '../src/usage/sampler';
import { daemonWithAdmin } from './admin-session';

const MB = 1e6;

const container = (id: string, service: string, state: string): ContainerState => ({
  id,
  service,
  state,
  health: null,
  image: service,
  imageId: `sha256:${service}`,
  startedAt: state === 'running' ? 1 : null,
  exitCode: state === 'running' ? null : 1,
});
const stats = (memBytes: number, cpuPercent: number, netRxBytes: number) => ({
  cpuPercent,
  memBytes,
  netRxBytes,
  netTxBytes: 0,
  diskReadBytes: 0,
  diskWriteBytes: 0,
});

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-APP-21 · Per-container usage', () => {
  it("lists each container with memory, CPU and download rate from the sampler's last reading", async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    s.db
      .insert(apps)
      .values({ id: 'vault', version: '1', state: 'running', hostname: 'vault', installedAt: 1, updatedAt: 1 } as never)
      .run();
    d.engine.containers.set(s.apps.project('vault').name, [
      container('c1', 'server', 'running'),
      container('c2', 'database', 'running'),
      container('c3', 'init', 'exited'),
    ]);
    d.engine.stats.set('c1', stats(64 * MB, 1, 0));
    d.engine.stats.set('c2', stats(30 * MB, 0.5, 0));
    await s.usage.sample();
    // The next sample has a download rate: 5 KB over 5 s.
    d.engine.stats.set('c1', stats(64 * MB, 1, 5000));
    await new Promise((r) => setTimeout(r, SAMPLE_MS / 50));
    await s.usage.sample();

    const detail = (await d.query('usage.appDetail', { appId: 'vault' })).result!.data as unknown as AppUsageDetail;
    expect(detail.containers.map((c) => [c.name, c.service, c.status])).toEqual([
      ['vault-server', 'server', 'running'],
      ['vault-database', 'database', 'running'],
      // Ended on its own while the app runs.
      ['vault-init', 'init', 'exited'],
    ]);
    const [server, database, init] = detail.containers;
    expect(server).toMatchObject({ memBytes: 64 * MB, cpu: 1 });
    expect(server!.netRx).toBeGreaterThan(0);
    expect(database).toMatchObject({ memBytes: 30 * MB, cpu: 0.5, netRx: 0 });
    expect(init).toMatchObject({ memBytes: null, cpu: null, netRx: null });
  });

  it('a container whose stats failed has no values; a stopped app shows its containers stopped', async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    s.db
      .insert(apps)
      .values({ id: 'vault', version: '1', state: 'running', hostname: 'vault', installedAt: 1, updatedAt: 1 } as never)
      .run();
    const project = s.apps.project('vault').name;
    d.engine.containers.set(project, [container('c1', 'server', 'running')]);
    d.engine.stats.set('c1', stats(64 * MB, 1, 0));
    await s.usage.sample();
    expect(s.usage.containerUsage('c1')).toMatchObject({ memBytes: 64 * MB });
    d.engine.statsErrors.add('c1');
    await s.usage.sample();
    expect(s.usage.containerUsage('c1')).toBeNull();

    s.db.update(apps).set({ state: 'stopped' }).run();
    d.engine.containers.set(project, [container('c1', 'server', 'exited')]);
    const detail = (await d.query('usage.appDetail', { appId: 'vault' })).result!.data as unknown as AppUsageDetail;
    expect(detail.containers).toEqual([
      { name: 'vault-server', service: 'server', status: 'stopped', memBytes: null, cpu: null, netRx: null },
    ]);
  });

  it('says how a container is doing in words people use', () => {
    expect(containerStatus('running', 'running')).toBe('running');
    expect(containerStatus('restarting', 'running')).toBe('restarting');
    expect(containerStatus('exited', 'running')).toBe('exited');
    expect(containerStatus('dead', 'error')).toBe('exited');
    expect(containerStatus('exited', 'stopped')).toBe('stopped');
    expect(containerStatus('created', 'starting')).toBe('stopped');
    // No container at all (taken down).
    expect(containerStatus(undefined, 'stopped')).toBe('stopped');
  });
});
