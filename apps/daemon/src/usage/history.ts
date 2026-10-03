// Usage history (US-USE-09, 02 §2.11): every minute one averaged 1m point per scope (the host and each app) from the
// samples in memory; every hour one 1h point per scope from those, and 1m points older than 7 days and 1h points older
// than 90 days go. `usage.history` serves 1 hour from the 5 s samples (1m points for any part before the daemon
// started), 24 hours from 1m points and 7 or 30 days from 1h points, with the peak of the metric asked for. A restart
// loses at most the minute not yet written.
import type { UsageSample } from '@hlabs/api';
import { usageSamples, type HlabsDb } from '@hlabs/db';
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { Logger } from '../logger';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const KEEP_1M_MS = 7 * DAY;
export const KEEP_1H_MS = 90 * DAY;

export type UsageRange = '1h' | '24h' | '7d' | '30d';
export type UsageMetric = 'cpu' | 'memBytes' | 'netRx' | 'netTx' | 'diskRead' | 'diskWrite';
export const METRICS: readonly UsageMetric[] = ['cpu', 'memBytes', 'netRx', 'netTx', 'diskRead', 'diskWrite'];

export type UsagePoint = { ts: number } & Record<UsageMetric, number | null>;

const RANGE_MS: Record<UsageRange, number> = { '1h': HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };

/** One scope's values in a sample: the host, or an app (absent when it wasn't running then). */
function valuesOf(sample: UsageSample, scope: string): Record<UsageMetric, number | null> | null {
  if (scope === 'host') return sample.host;
  return sample.apps.find((a) => a.appId === scope) ?? null;
}

function average(points: ReadonlyArray<Record<UsageMetric, number | null>>): Record<UsageMetric, number | null> {
  const out = {} as Record<UsageMetric, number | null>;
  for (const m of METRICS) {
    const values = points.map((p) => p[m]).filter((v): v is number => v !== null);
    out[m] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return out;
}

const toRow = (ts: number, resolution: '1m' | '1h', scope: string, v: Record<UsageMetric, number | null>) => ({
  ts,
  resolution,
  scope,
  cpu: v.cpu,
  memBytes: v.memBytes === null ? null : Math.round(v.memBytes),
  netRx: v.netRx === null ? null : Math.round(v.netRx),
  netTx: v.netTx === null ? null : Math.round(v.netTx),
  diskRead: v.diskRead === null ? null : Math.round(v.diskRead),
  diskWrite: v.diskWrite === null ? null : Math.round(v.diskWrite),
});

export class UsageHistory {
  private timer: NodeJS.Timeout | null = null;
  /** The last minute and hour already written (their start). */
  private lastMinute = 0;
  private lastHour = 0;

  constructor(
    private readonly deps: {
      db: HlabsDb;
      recent: () => readonly UsageSample[];
      logger: Logger;
      now?: () => number;
    },
  ) {}

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  /** Writes each finished minute (and hour) shortly after it ends. */
  start(): void {
    if (this.timer) return;
    const tick = () => {
      try {
        this.flush();
      } catch (err) {
        this.deps.logger.warn({ err }, 'usage history flush failed');
      }
    };
    const untilNext = MINUTE - (this.now() % MINUTE) + 1_000;
    this.timer = setTimeout(() => {
      tick();
      this.timer = setInterval(tick, MINUTE);
      this.timer.unref();
    }, untilNext);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
    }
    this.timer = null;
  }

  /** Writes the last finished minute, then the last finished hour when one ended, then prunes. */
  flush(): void {
    const now = this.now();
    const minute = Math.floor(now / MINUTE) * MINUTE - MINUTE;
    if (minute > this.lastMinute) {
      this.writeMinute(minute);
      this.lastMinute = minute;
    }
    const hour = Math.floor(now / HOUR) * HOUR - HOUR;
    if (hour > this.lastHour) {
      this.writeHour(hour);
      this.lastHour = hour;
      this.prune(now);
    }
  }

  /** One 1m point per scope for [start, start + 1 min). */
  writeMinute(start: number): void {
    const samples = this.deps.recent().filter((s) => s.ts >= start && s.ts < start + MINUTE);
    if (samples.length === 0) return;
    const scopes = new Set(['host', ...samples.flatMap((s) => s.apps.map((a) => a.appId))]);
    const rows = [...scopes].flatMap((scope) => {
      const values = samples.map((s) => valuesOf(s, scope)).filter((v) => v !== null);
      return values.length ? [toRow(start, '1m', scope, average(values))] : [];
    });
    this.deps.db.insert(usageSamples).values(rows).onConflictDoNothing().run();
  }

  /** One 1h point per scope for [start, start + 1 h) from its 1m points. */
  writeHour(start: number): void {
    const minutes = this.deps.db
      .select()
      .from(usageSamples)
      .where(and(eq(usageSamples.resolution, '1m'), gte(usageSamples.ts, start), lt(usageSamples.ts, start + HOUR)))
      .all();
    const byScope = new Map<string, typeof minutes>();
    for (const r of minutes) byScope.set(r.scope, [...(byScope.get(r.scope) ?? []), r]);
    const rows = [...byScope].map(([scope, points]) => toRow(start, '1h', scope, average(points)));
    if (rows.length) this.deps.db.insert(usageSamples).values(rows).onConflictDoNothing().run();
  }

  prune(now = this.now()): void {
    const { db } = this.deps;
    db.delete(usageSamples)
      .where(and(eq(usageSamples.resolution, '1m'), lt(usageSamples.ts, now - KEEP_1M_MS)))
      .run();
    db.delete(usageSamples)
      .where(and(eq(usageSamples.resolution, '1h'), lt(usageSamples.ts, now - KEEP_1H_MS)))
      .run();
  }

  /**
   * A scope's points over a range, oldest first, and the peak of `metric` (null without data). 1 hour: 5 s samples,
   * with 1m points before the oldest; 24 hours: 1m points; 7 and 30 days: 1h points.
   */
  history(scope: string, range: UsageRange, metric: UsageMetric = 'cpu') {
    const now = this.now();
    const from = now - RANGE_MS[range];
    let points: UsagePoint[];
    let resolution: '5s' | '1m' | '1h';
    if (range === '1h') {
      resolution = '5s';
      const live = this.deps
        .recent()
        .filter((s) => s.ts >= from)
        .flatMap((s) => {
          const v = valuesOf(s, scope);
          return v ? [{ ts: s.ts, ...pick(v) }] : [];
        });
      const firstLive = live[0]?.ts ?? now;
      points = [...this.stored(scope, '1m', from, firstLive), ...live];
    } else {
      resolution = range === '24h' ? '1m' : '1h';
      points = this.stored(scope, resolution, from, now);
    }
    let peak: { ts: number; value: number } | null = null;
    for (const p of points) {
      const v = p[metric];
      if (v !== null && (peak === null || v > peak.value)) peak = { ts: p.ts, value: v };
    }
    return { scope, range, resolution, points, peak };
  }

  private stored(scope: string, resolution: '1m' | '1h', from: number, to: number): UsagePoint[] {
    return this.deps.db
      .select()
      .from(usageSamples)
      .where(
        and(
          eq(usageSamples.scope, scope),
          eq(usageSamples.resolution, resolution),
          gte(usageSamples.ts, from),
          lt(usageSamples.ts, to),
        ),
      )
      .orderBy(asc(usageSamples.ts))
      .all()
      .map((r) => ({ ts: r.ts, ...pick(r) }));
  }
}

function pick(v: Record<UsageMetric, number | null>): Record<UsageMetric, number | null> {
  return {
    cpu: v.cpu,
    memBytes: v.memBytes,
    netRx: v.netRx,
    netTx: v.netTx,
    diskRead: v.diskRead,
    diskWrite: v.diskWrite,
  };
}
