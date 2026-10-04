// US-USE-04 · Read a metric's history and its peak (server side): the peak of the metric asked for, memory by app as
// the five apps using the most in the range plus "Other" (the rest of the host's memory), apps uninstalled during the
// range still there, a member only seeing their apps; and the storage root's disk by use.
import type { UsageSample } from '@hlabs/api';
import { apps, getSetting, setSetting, usageSamples } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { silentLogger } from '../src/logger';
import { MINUTE, UsageHistory } from '../src/usage/history';
import { daemonWithAdmin } from './admin-session';
import { startDaemon } from './helpers';
import { memberSession } from './member-session';

const T0 = Date.UTC(2026, 9, 3, 10, 0, 0);
const GB = 1e9;

function sample(ts: number, cpu: number, mem: Record<string, number>, hostMem = 10 * GB): UsageSample {
  return {
    ts,
    host: { cpu, memBytes: hostMem, memTotalBytes: 16 * GB, netRx: 10, netTx: 5, diskRead: 0, diskWrite: 0 },
    apps: Object.entries(mem).map(([appId, memBytes]) => ({
      appId,
      cpu: 1,
      memBytes,
      netRx: 0,
      netTx: 0,
      diskRead: 0,
      diskWrite: 0,
    })),
  };
}

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-USE-04 · Read a metric’s history and its peak', () => {
  async function history(ring: UsageSample[], now: number) {
    const d = await startDaemon();
    closers.push(d.close);
    return new UsageHistory({ db: d.services!.db, recent: () => ring, logger: silentLogger(), now: () => now });
  }

  it('the peak is the highest point of the metric asked for, and a flat 0 range peaks at 0', async () => {
    const ring = [sample(T0, 10, {}), sample(T0 + 5000, 46, {}), sample(T0 + 10_000, 20, {})];
    const h = await history(ring, T0 + 20_000);
    expect(h.history('host', '1h').peak).toEqual({ ts: T0 + 5000, value: 46 });
    expect(h.history('host', '1h', 'netRx').peak).toEqual({ ts: T0, value: 10 });
    const flat = await history([sample(T0, 0, {}), sample(T0 + 5000, 0, {})], T0 + 10_000);
    expect(flat.history('host', '1h').peak).toEqual({ ts: T0, value: 0 });
  });

  it('memory by app: the five apps using the most, in order, and "Other" for the rest of the host', async () => {
    const mem = { a: 1 * GB, b: 0.5 * GB, c: 2 * GB, d: 0.2 * GB, e: 0.1 * GB, f: 0.05 * GB, g: 0.01 * GB };
    const ring = [sample(T0, 5, mem), sample(T0 + 5000, 5, mem)];
    const h = await history(ring, T0 + 10_000);
    const m = h.memoryByApp('1h', null);
    expect(m.series.map((s) => s.appId)).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(m.ts).toEqual([T0, T0 + 5000]);
    // 10 GB - (2 + 1 + 0.5 + 0.2 + 0.1): f, g, hlabs and the system.
    expect(m.other[0]).toBeCloseTo(6.2 * GB);
    expect(m.peak).toEqual({ ts: T0, value: 10 * GB });
  });

  it('an app uninstalled during the range is still there; a member sees only the apps allowed', async () => {
    const ring = [sample(T0, 5, { gone: 3 * GB, immich: 1 * GB }), sample(T0 + 5000, 5, { immich: 1 * GB })];
    const h = await history(ring, T0 + 10_000);
    const all = h.memoryByApp('1h', null);
    expect(all.series.map((s) => s.appId)).toEqual(['gone', 'immich']);
    expect(all.series[0]!.values).toEqual([3 * GB, 0]);
    const member = h.memoryByApp('1h', new Set(['immich']));
    expect(member.series.map((s) => s.appId)).toEqual(['immich']);
  });

  it('usage.memoryByApp names the apps and filters by member; usage.overview has storage by use', async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    s.db
      .insert(apps)
      .values(
        ['immich', 'vault'].map(
          (id) => ({ id, version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 }) as never,
        ),
      )
      .run();
    const ts = Math.floor(Date.now() / MINUTE) * MINUTE - 10 * MINUTE;
    const row = (scope: string, memBytes: number) => ({
      ts,
      resolution: '1m' as const,
      scope,
      cpu: 1,
      memBytes,
      netRx: 0,
      netTx: 0,
      diskRead: 0,
      diskWrite: 0,
    });
    s.db
      .insert(usageSamples)
      .values([row('host', 8 * GB), row('immich', 2 * GB), row('vault', 1 * GB)])
      .run();

    const admin = (await d.query('usage.memoryByApp', { range: '24h' })).result!.data as {
      series: Array<{ appId: string; name: string }>;
      other: number[];
    };
    expect(admin.series.map((x) => x.appId)).toEqual(['immich', 'vault']);
    expect(admin.series[0]!.name).toBe(s.catalog.get('immich')?.manifest.name ?? 'immich');
    expect(admin.other).toEqual([5 * GB]);

    const anu = await memberSession(d, { appIds: ['immich'] });
    setSetting(s.db, 'people', { ...getSetting(s.db, 'people'), membersCanSeeUsage: true });
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: ['immich'], canSeeUsage: true });
    const member = (await anu.query('usage.memoryByApp', { range: '24h' })).result!.data as {
      series: Array<{ appId: string }>;
      other: number[];
    };
    expect(member.series.map((x) => x.appId)).toEqual(['immich']);
    expect(member.other).toEqual([6 * GB]);

    const overview = (await d.query('usage.overview')).result!.data as {
      storage: { usedBytes: number; appsBytes: number; filesBytes: number; systemBytes: number } | null;
    };
    if (overview.storage) {
      expect(overview.storage.appsBytes + overview.storage.filesBytes + overview.storage.systemBytes).toBe(
        overview.storage.usedBytes,
      );
    }
  });
});
