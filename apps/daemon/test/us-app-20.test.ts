// US-APP-20 · Resource use tiles and 24-hour chart (server side): usage.appDetail gives the app's values in the latest
// sample, its average CPU since midnight, its memory peak over 24 hours and its disk; admins only.
import type { AppUsageDetail, UsageSample } from '@hlabs/api';
import { apps, usageSamples } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { MINUTE, UsageHistory } from '../src/usage/history';
import { daemonWithAdmin } from './admin-session';
import { startDaemon } from './helpers';
import { memberSession } from './member-session';

const MB = 1e6;
/** Noon local time, so "today" has a morning before it. */
const NOON = new Date(2026, 10, 23, 12, 0, 0).getTime();

function sample(ts: number, cpu: number, memBytes: number): UsageSample {
  return {
    ts,
    host: { cpu: 10, memBytes: 8e9, memTotalBytes: 16e9, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 },
    apps: [{ appId: 'vault', cpu, memBytes, netRx: 1000, netTx: 0, diskRead: 0, diskWrite: 0 }],
  };
}
const point = (ts: number, cpu: number | null, memBytes: number | null) => ({
  ts,
  resolution: '1m' as const,
  scope: 'vault',
  cpu,
  memBytes,
  netRx: 0,
  netTx: 0,
  diskRead: 0,
  diskWrite: 0,
});

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-APP-20 · Resource use tiles and 24-hour chart', () => {
  it("averages today's CPU from 1m points and newer 5 s samples, and takes memory's peak over 24 hours", async () => {
    const d = await startDaemon();
    closers.push(d.close);
    const ring: UsageSample[] = [];
    const history = new UsageHistory({
      db: d.services!.db,
      recent: () => ring,
      logger: silentLogger(),
      now: () => NOON,
    });
    expect(history.appSummary('vault')).toEqual({ cpuAvgToday: null, memPeak24h: null });

    d.services!.db.insert(usageSamples)
      .values([
        // Yesterday evening: in the 24 hours, not today.
        point(NOON - 14 * 60 * MINUTE, 50, 91 * MB),
        point(NOON - 3 * MINUTE, 1, 60 * MB),
        point(NOON - 2 * MINUTE, 2, 62 * MB),
        // Stopped for a minute: no values.
        point(NOON - 4 * MINUTE, null, null),
      ])
      .run();
    // The current minute, not written yet (12 samples = one more minute at 3%); one before it is already in a 1m point.
    ring.push(sample(NOON - 2 * MINUTE + 5000, 99, 70 * MB));
    for (let i = 0; i < 12; i++) ring.push(sample(NOON - MINUTE + i * 5000, 3, 64 * MB));

    const summary = history.appSummary('vault');
    expect(summary.cpuAvgToday).toBeCloseTo(2);
    expect(summary.memPeak24h).toBe(91 * MB);
  });

  it('usage.appDetail returns current, the day and peak figures, disk and when it was installed; admins only', async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    const installedAt = Date.now() - 5 * MINUTE;
    s.db
      .insert(apps)
      .values({ id: 'vault', version: '1', state: 'running', hostname: 'vault', installedAt, updatedAt: 1 } as never)
      .run();
    d.engine.containers.set(s.apps.project('vault').name, [
      {
        id: 'c1',
        service: 'server',
        state: 'running',
        health: null,
        image: 'vaultwarden',
        imageId: 'sha256:v',
        startedAt: 1,
        exitCode: null,
      },
    ]);
    d.engine.imageSizes.set('sha256:v', 150 * MB);
    d.engine.stats.set('c1', {
      cpuPercent: 1,
      memBytes: 64 * MB,
      netRxBytes: 0,
      netTxBytes: 0,
      diskReadBytes: 0,
      diskWriteBytes: 0,
    });
    s.db
      .insert(usageSamples)
      .values(point(Math.floor(Date.now() / MINUTE) * MINUTE - 10 * MINUTE, 0.4, 91 * MB))
      .run();
    await s.usage.sample();
    // Wait for the first disk count (it carries on in the background).
    await s.appDisk.get('vault');
    await new Promise((r) => setTimeout(r, 50));

    const detail = (await d.query('usage.appDetail', { appId: 'vault' })).result!.data as unknown as AppUsageDetail;
    expect(detail.appId).toBe('vault');
    expect(detail.installedAt).toBe(installedAt);
    expect(detail.current).toMatchObject({ appId: 'vault', cpu: 1, memBytes: 64 * MB });
    expect(detail.memPeak24h).toBe(91 * MB);
    expect(detail.cpuAvgToday).not.toBeNull();
    expect(detail.disk).toEqual({ dataBytes: 0, imageBytes: 150 * MB });

    expect((await d.query('usage.appDetail', { appId: 'nope' })).error?.data.hlabsCode).toBe('NOT_FOUND');
    const anu = await memberSession(d, { appIds: ['vault'] });
    expect((await anu.query('usage.appDetail', { appId: 'vault' })).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });

  it('a stopped app has no current values', async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    s.db
      .insert(apps)
      .values({ id: 'vault', version: '1', state: 'stopped', hostname: 'vault', installedAt: 1, updatedAt: 1 } as never)
      .run();
    await s.usage.sample();
    const detail = (await d.query('usage.appDetail', { appId: 'vault' })).result!.data as unknown as AppUsageDetail;
    expect(detail.current).toBeNull();
    expect(detail.cpuAvgToday).toBeNull();
    expect(detail.memPeak24h).toBeNull();
  });
});
