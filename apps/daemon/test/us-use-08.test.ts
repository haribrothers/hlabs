// US-USE-08 · Sample host and app usage every 5 seconds.
import { apps } from '@hlabs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDockerStats } from '../src/engine/dockerode-engine';
import { silentLogger } from '../src/logger';
import { rate, RING_SIZE, SAMPLE_MS, UsageSampler } from '../src/usage/sampler';
import { FakeHostStats } from './fakes/host-stats';
import { startDaemon } from './helpers';

function app(id: string, state = 'running') {
  return { id, version: '1', state, hostname: id, installedAt: 1, updatedAt: 1 } as never;
}
const running = (id: string) =>
  ({
    id,
    service: 'web',
    state: 'running',
    health: null,
    image: 'x',
    imageId: 'sha256:x',
    startedAt: 1,
    exitCode: null,
  }) as never;

describe('US-USE-08 · Sample host and app usage every 5 seconds', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    vi.useRealTimers();
    await close?.();
    close = undefined;
  });

  async function setup() {
    const d = await startDaemon();
    close = d.close;
    await d.services!.reconciled;
    let now = 1_000_000;
    const host = new FakeHostStats(18, 9e9);
    const sampler = new UsageSampler({
      db: d.services!.db,
      bus: d.services!.bus,
      engine: d.services!.engine,
      host,
      logger: silentLogger(),
      composePrefix: 'hlabs',
      now: () => now,
      totalMemory: () => 16e9,
      statsTimeoutMs: 50,
    });
    const advance = (ms = SAMPLE_MS) => (now += ms);
    return { d, sampler, host, advance };
  }

  it('samples host CPU, memory, network and disk, and each running app, and publishes it', async () => {
    const { d, sampler, host, advance } = await setup();
    d.services!.db.insert(apps)
      .values([app('immich'), app('jellyfin', 'stopped')])
      .run();
    d.engine.containers.set('hlabs-immich', [running('c1'), running('c2')]);
    d.engine.stats.set('c1', {
      cpuPercent: 5,
      memBytes: 1e9,
      netRxBytes: 1000,
      netTxBytes: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
    });
    d.engine.stats.set('c2', {
      cpuPercent: 2,
      memBytes: 5e8,
      netRxBytes: 0,
      netTxBytes: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
    });
    const events: unknown[] = [];
    d.services!.bus.on((e) => e.event.type === 'usage.sample' && events.push(e.event.data));

    const first = await sampler.sample();
    // The first sample after start has no rates yet.
    expect(first.host).toMatchObject({ cpu: 18, memBytes: 9e9, memTotalBytes: 16e9, netRx: null, diskRead: null });
    expect(first.apps).toEqual([
      { appId: 'immich', cpu: 7, memBytes: 1.5e9, netRx: null, netTx: null, diskRead: null, diskWrite: null },
    ]);

    host.totals = { netRxBytes: 10_000, netTxBytes: 5_000, diskReadBytes: 50_000, diskWriteBytes: 0 };
    d.engine.stats.set('c1', {
      cpuPercent: 5,
      memBytes: 1e9,
      netRxBytes: 6000,
      netTxBytes: 500,
      diskReadBytes: 0,
      diskWriteBytes: 0,
    });
    advance();
    await sampler.sample();
    host.totals = { netRxBytes: 20_000, netTxBytes: 5_000, diskReadBytes: 100_000, diskWriteBytes: 0 };
    advance();
    const third = await sampler.sample();
    expect(third.host).toMatchObject({ netRx: 2000, netTx: 0, diskRead: 10_000, diskWrite: 0 });
    expect(sampler.latest()).toBe(third);
    expect(events).toHaveLength(3);
    expect(events.at(-1)).toEqual(third);
  });

  it('a counter that went back (a restarted container) counts as 0, not negative', () => {
    const before = { at: 0, totals: { netRxBytes: 10_000, netTxBytes: 0, diskReadBytes: 0, diskWriteBytes: 0 } };
    expect(rate(before, 5000, 2000, 'netRxBytes')).toBe(0);
    expect(rate(before, 5000, 15_000, 'netRxBytes')).toBe(1000);
    expect(rate(undefined, 5000, 15_000, 'netRxBytes')).toBeNull();
  });

  it('a container whose stats are slow or fail leaves its app without values; the rest is published', async () => {
    const { d, sampler } = await setup();
    d.services!.db.insert(apps)
      .values([app('immich'), app('paperless'), app('kuma')])
      .run();
    d.engine.containers.set('hlabs-immich', [running('slow')]);
    d.engine.containers.set('hlabs-paperless', [running('broken')]);
    d.engine.containers.set('hlabs-kuma', [running('ok')]);
    d.engine.slowStats.add('slow');
    d.engine.statsErrors.add('broken');
    d.engine.stats.set('ok', {
      cpuPercent: 1,
      memBytes: 2e8,
      netRxBytes: 0,
      netTxBytes: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
    });
    const s = await sampler.sample();
    expect(s.host.cpu).toBe(18);
    const byApp = Object.fromEntries(s.apps.map((a) => [a.appId, a]));
    expect(byApp.immich).toMatchObject({ cpu: null, memBytes: null });
    expect(byApp.paperless).toMatchObject({ cpu: null, memBytes: null });
    expect(byApp.kuma).toMatchObject({ cpu: 1, memBytes: 2e8 });
  });

  it('with the engine stopped, the host is still sampled and apps are skipped', async () => {
    const { d, sampler } = await setup();
    d.services!.db.insert(apps)
      .values([app('immich')])
      .run();
    d.engine.running = false;
    await d.services!.engine.check();
    const s = await sampler.sample();
    expect(s.host.cpu).toBe(18);
    expect(s.apps).toEqual([]);
  });

  it('keeps the last hour: 720 samples', async () => {
    const { sampler, advance } = await setup();
    for (let i = 0; i < RING_SIZE + 5; i++) {
      advance();
      await sampler.sample();
    }
    expect(sampler.recent()).toHaveLength(RING_SIZE);
  });

  it('takes a sample at once and then every 5 s', async () => {
    const { sampler } = await setup();
    vi.useFakeTimers();
    const spy = vi.spyOn(sampler, 'sample');
    sampler.start();
    await vi.advanceTimersByTimeAsync(15_000);
    sampler.stop();
    // At start, then at 5, 10 and 15 s (timers drive tick, which calls sample).
    expect(spy.mock.calls.length + 1).toBeGreaterThanOrEqual(4);
    expect(sampler.recent().length).toBe(4);
  });

  it('usage.current returns the latest sample', async () => {
    const d = await startDaemon();
    close = d.close;
    expect(
      ((await (await fetch(`${d.url}/trpc/usage.current`)).json()) as { result: { data: unknown } }).result.data,
    ).toBeNull();
    const s = await d.services!.usage.sample();
    const body = (await (await fetch(`${d.url}/trpc/usage.current`)).json()) as { result: { data: unknown } };
    expect(body.result.data).toEqual(s);
  });

  it('reads Docker stats as a share of the whole host, memory without the file cache', () => {
    const s = parseDockerStats({
      cpu_stats: { cpu_usage: { total_usage: 2_000 }, system_cpu_usage: 20_000, online_cpus: 8 },
      precpu_stats: { cpu_usage: { total_usage: 1_000 }, system_cpu_usage: 10_000 },
      memory_stats: { usage: 1_500, stats: { inactive_file: 500 } },
      networks: { eth0: { rx_bytes: 100, tx_bytes: 50 }, eth1: { rx_bytes: 1, tx_bytes: 2 } },
      blkio_stats: {
        io_service_bytes_recursive: [
          { op: 'Read', value: 7 },
          { op: 'Write', value: 9 },
          { op: 'read', value: 1 },
        ],
      },
    });
    expect(s).toEqual({
      cpuPercent: 10,
      memBytes: 1000,
      netRxBytes: 101,
      netTxBytes: 52,
      diskReadBytes: 8,
      diskWriteBytes: 9,
    });
    expect(parseDockerStats({}).cpuPercent).toBe(0);
  });

  it('stays light: 30 running containers cost well under 2% of one core per 5 s sample', async () => {
    const { d, sampler, advance } = await setup();
    const ids = Array.from({ length: 30 }, (_, i) => `app${i}`);
    d.services!.db.insert(apps)
      .values(ids.map((id) => app(id)))
      .run();
    for (const id of ids) d.engine.containers.set(`hlabs-${id}`, [running(`${id}-c`)]);
    const SAMPLES = 20;
    const start = process.cpuUsage();
    for (let i = 0; i < SAMPLES; i++) {
      advance();
      await sampler.sample();
    }
    const used = process.cpuUsage(start);
    const msPerSample = (used.user + used.system) / 1000 / SAMPLES;
    // 2% of one core over 5 s is 100 ms per sample.
    expect(msPerSample).toBeLessThan(100);
  });
});
