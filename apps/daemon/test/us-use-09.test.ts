// US-USE-09 · Keep usage history at the right resolution.
import type { UsageSample } from '@hlabs/api';
import { usageSamples } from '@hlabs/db';
import { and, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { HOUR, KEEP_1H_MS, KEEP_1M_MS, MINUTE, UsageHistory } from '../src/usage/history';
import { startDaemon } from './helpers';

const T0 = Date.UTC(2026, 9, 3, 10, 0, 0);

function sample(ts: number, cpu: number, apps: Array<{ appId: string; memBytes: number }> = []): UsageSample {
  return {
    ts,
    host: { cpu, memBytes: 8e9, memTotalBytes: 16e9, netRx: 100, netTx: 50, diskRead: null, diskWrite: 0 },
    apps: apps.map((a) => ({
      appId: a.appId,
      cpu: 1,
      memBytes: a.memBytes,
      netRx: 0,
      netTx: 0,
      diskRead: 0,
      diskWrite: 0,
    })),
  };
}

describe('US-USE-09 · Keep usage history at the right resolution', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  async function setup() {
    const d = await startDaemon();
    close = d.close;
    let now = T0;
    const ring: UsageSample[] = [];
    const history = new UsageHistory({
      db: d.services!.db,
      recent: () => ring,
      logger: silentLogger(),
      now: () => now,
    });
    const rows = (resolution: '1m' | '1h', scope = 'host') =>
      d
        .services!.db.select()
        .from(usageSamples)
        .where(and(eq(usageSamples.resolution, resolution), eq(usageSamples.scope, scope)))
        .all();
    return { d, ring, history, rows, at: (t: number) => (now = t) };
  }

  it('every minute writes one averaged 1m point per scope, the host and each app', async () => {
    const { ring, history, rows, at } = await setup();
    for (let i = 0; i < 12; i++)
      ring.push(sample(T0 + i * 5000, i < 6 ? 10 : 30, [{ appId: 'immich', memBytes: 1e9 }]));
    at(T0 + MINUTE + 1000);
    history.flush();
    expect(rows('1m')).toEqual([
      expect.objectContaining({ ts: T0, cpu: 20, memBytes: 8e9, netRx: 100, diskRead: null }),
    ]);
    expect(rows('1m', 'immich')).toEqual([expect.objectContaining({ ts: T0, memBytes: 1e9 })]);
    // Writing again doesn't duplicate it.
    history.flush();
    expect(rows('1m')).toHaveLength(1);
  });

  it('every hour writes one 1h point per scope from the 1m points, and prunes old points', async () => {
    const { d, history, rows, at } = await setup();
    const { db } = d.services!;
    const minute = (ts: number, cpu: number, resolution: '1m' | '1h' = '1m') =>
      ({ ts, resolution, scope: 'host', cpu, memBytes: 1, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 }) as const;
    db.insert(usageSamples)
      .values([
        minute(T0, 10),
        minute(T0 + 30 * MINUTE, 50),
        // Too old to keep.
        minute(T0 - KEEP_1M_MS - MINUTE, 1),
        minute(T0 - KEEP_1H_MS - HOUR, 1, '1h'),
        // Old enough for a 1m point, still kept as 1h.
        minute(T0 - KEEP_1M_MS - HOUR, 1, '1h'),
      ])
      .run();
    at(T0 + HOUR + 1000);
    history.flush();
    expect(rows('1h').map((r) => [r.ts, r.cpu])).toEqual([
      [T0 - KEEP_1M_MS - HOUR, 1],
      [T0, 30],
    ]);
    expect(rows('1m').map((r) => r.ts)).toEqual([T0, T0 + 30 * MINUTE]);
  });

  it('1 hour serves 5 s samples, with 1m points for the part before the daemon started', async () => {
    const { d, ring, history, at } = await setup();
    at(T0 + HOUR);
    d.services!.db.insert(usageSamples)
      .values([
        {
          ts: T0 + 10 * MINUTE,
          resolution: '1m',
          scope: 'host',
          cpu: 40,
          memBytes: 1,
          netRx: 0,
          netTx: 0,
          diskRead: 0,
          diskWrite: 0,
        },
        // Covered by live samples: not repeated.
        {
          ts: T0 + 50 * MINUTE,
          resolution: '1m',
          scope: 'host',
          cpu: 99,
          memBytes: 1,
          netRx: 0,
          netTx: 0,
          diskRead: 0,
          diskWrite: 0,
        },
      ])
      .run();
    ring.push(sample(T0 + 45 * MINUTE, 46), sample(T0 + 45 * MINUTE + 5000, 12));
    const h = history.history('host', '1h');
    expect(h.resolution).toBe('5s');
    expect(h.points.map((p) => [p.ts, p.cpu])).toEqual([
      [T0 + 10 * MINUTE, 40],
      [T0 + 45 * MINUTE, 46],
      [T0 + 45 * MINUTE + 5000, 12],
    ]);
    expect(h.peak).toEqual({ ts: T0 + 45 * MINUTE, value: 46 });
  });

  it('24 hours serves 1m points and 7 days 1h points, with the peak of the metric asked for', async () => {
    const { d, history, at } = await setup();
    at(T0 + 2 * HOUR);
    const row = (ts: number, resolution: '1m' | '1h', cpu: number, memBytes: number) =>
      ({ ts, resolution, scope: 'host', cpu, memBytes, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 }) as const;
    d.services!.db.insert(usageSamples)
      .values([row(T0, '1m', 10, 5e9), row(T0 + MINUTE, '1m', 20, 9e9), row(T0, '1h', 15, 7e9)])
      .run();
    const day = history.history('host', '24h', 'memBytes');
    expect(day).toMatchObject({ resolution: '1m', peak: { ts: T0 + MINUTE, value: 9e9 } });
    expect(day.points).toHaveLength(2);
    const week = history.history('host', '7d');
    expect(week).toMatchObject({ resolution: '1h', peak: { ts: T0, value: 15 } });
    expect(week.points).toHaveLength(1);
  });

  it('no data: no points and no peak; an uninstalled app keeps its history until it ages out', async () => {
    const { d, history, at } = await setup();
    at(T0 + HOUR);
    expect(history.history('host', '24h')).toMatchObject({ points: [], peak: null });
    d.services!.db.insert(usageSamples)
      .values({
        ts: T0,
        resolution: '1m',
        scope: 'gone-app',
        cpu: 3,
        memBytes: 1,
        netRx: 0,
        netTx: 0,
        diskRead: 0,
        diskWrite: 0,
      })
      .run();
    expect(history.history('gone-app', '24h').points).toHaveLength(1);
  });

  it('usage.history answers over the API', async () => {
    const d = await startDaemon();
    close = d.close;
    await d.services!.usage.sample();
    const res = await fetch(
      `${d.url}/trpc/usage.history?input=${encodeURIComponent(JSON.stringify({ scope: 'host', range: '1h' }))}`,
    );
    const body = (await res.json()) as { result: { data: { resolution: string; points: unknown[] } } };
    expect(body.result.data.resolution).toBe('5s');
    expect(body.result.data.points).toHaveLength(1);
  });
});
