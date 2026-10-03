// Usage sampling (US-USE-08, 02 §2.11): every 5 s the host's CPU, memory, network and disk, and every running app's
// containers (`docker stats` once each, 8 at a time, 3 s each). The last hour stays in memory (720 samples); each sample
// is a `usage.sample` event and what `usage.current` returns. Network and disk are rates between two samples: the first
// sample after start has none, and a counter that went back (a restarted container) counts as 0. A container whose
// stats are slow or fail leaves its app without values for that sample; the rest is still published. With the engine
// stopped, only the host is sampled.
import type { AppSample, UsageSample } from '@hlabs/api';
import { apps, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { totalmem } from 'node:os';
import type { EngineService } from '../engine/service';
import type { ContainerStats } from '../engine/types';
import type { EventBus } from '../events/bus';
import type { Logger } from '../logger';
import type { HostCounters, HostStats } from '../platform/host-stats';

export const SAMPLE_MS = 5_000;
/** One hour at 5 s. */
export const RING_SIZE = 720;
export const STATS_TIMEOUT_MS = 3_000;
export const STATS_CONCURRENCY = 8;

export interface SamplerDeps {
  db: HlabsDb;
  bus: EventBus;
  engine: Pick<EngineService, 'client'>;
  host: HostStats;
  logger: Logger;
  /** Compose project names are `<prefix>-<appId>`. */
  composePrefix: string;
  now?: () => number;
  totalMemory?: () => number;
  statsTimeoutMs?: number;
}

type Totals = Pick<ContainerStats, 'netRxBytes' | 'netTxBytes' | 'diskReadBytes' | 'diskWriteBytes'>;
interface Reading {
  at: number;
  totals: Totals;
}

/** Bytes per second between two totals; null without an earlier one, 0 when the counter went back. */
export function rate(previous: Reading | undefined, at: number, total: number, key: keyof Totals): number | null {
  if (!previous || at <= previous.at) return null;
  return Math.max(0, total - previous.totals[key]) / ((at - previous.at) / 1000);
}

/** Runs `tasks` with at most `limit` at once. */
async function pool<T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await run(items[next++]!);
  });
  await Promise.all(workers);
}

function withTimeout<T>(ms: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return Promise.race([
    call(controller.signal),
    new Promise<never>((_, reject) =>
      controller.signal.addEventListener('abort', () => reject(new Error('stats took too long'))),
    ),
  ]).finally(() => clearTimeout(timer));
}

export class UsageSampler {
  private readonly ring: UsageSample[] = [];
  private hostBefore: Reading | undefined;
  /** Container id → its last totals. */
  private readonly containersBefore = new Map<string, Reading>();
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<UsageSample> | null = null;

  constructor(private readonly deps: SamplerDeps) {}

  start(intervalMs = SAMPLE_MS): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** The newest sample, or null before the first. */
  latest(): UsageSample | null {
    return this.ring.at(-1) ?? null;
  }

  /** The last hour, oldest first. */
  recent(): readonly UsageSample[] {
    return this.ring;
  }

  /** One sample unless one is still being taken (a slow engine never piles samples up). */
  private async tick(): Promise<void> {
    if (this.running) return;
    try {
      await this.sample();
    } catch (err) {
      this.deps.logger.warn({ err }, 'usage sample failed');
    }
  }

  async sample(): Promise<UsageSample> {
    if (this.running) return this.running;
    this.running = this.take().finally(() => (this.running = null));
    return this.running;
  }

  private async take(): Promise<UsageSample> {
    const now = this.deps.now ?? Date.now;
    const at = now();
    const [host, appSamples] = await Promise.all([this.hostSample(at), this.appSamples(at)]);
    const sample: UsageSample = { ts: at, host, apps: appSamples };
    this.ring.push(sample);
    if (this.ring.length > RING_SIZE) this.ring.splice(0, this.ring.length - RING_SIZE);
    this.deps.bus.emit('usage.sample', sample);
    return sample;
  }

  private async hostSample(at: number): Promise<UsageSample['host']> {
    const { host } = this.deps;
    const [cpu, memBytes, counters] = await Promise.all([host.cpuPercent(), host.memoryUsedBytes(), host.counters()]);
    const before = this.hostBefore;
    const reading = counters ? { at, totals: toTotals(counters) } : undefined;
    if (reading) this.hostBefore = reading;
    const r = (key: keyof Totals) => (reading ? rate(before, at, reading.totals[key], key) : null);
    return {
      cpu: cpu === null ? null : Math.min(100, Math.max(0, cpu)),
      memBytes,
      memTotalBytes: (this.deps.totalMemory ?? totalmem)(),
      netRx: r('netRxBytes'),
      netTx: r('netTxBytes'),
      diskRead: r('diskReadBytes'),
      diskWrite: r('diskWriteBytes'),
    };
  }

  private async appSamples(at: number): Promise<AppSample[]> {
    const client = this.deps.engine.client;
    if (!client) return [];
    const running = this.deps.db
      .select({ id: apps.id })
      .from(apps)
      .where(eq(apps.state, 'running'))
      .all()
      .map((a) => a.id);
    const containers: Array<{ appId: string; id: string }> = [];
    await Promise.all(
      running.map(async (appId) => {
        const list = await client.projectContainers(`${this.deps.composePrefix}-${appId}`).catch(() => []);
        for (const c of list) if (c.state === 'running') containers.push({ appId, id: c.id });
      }),
    );
    const stats = new Map<string, ContainerStats | null>();
    await pool(containers, STATS_CONCURRENCY, async ({ id }) => {
      stats.set(
        id,
        await withTimeout(this.deps.statsTimeoutMs ?? STATS_TIMEOUT_MS, (signal) =>
          client.containerStats(id, signal),
        ).catch(() => null),
      );
    });
    const seen = new Set(containers.map((c) => c.id));
    for (const id of this.containersBefore.keys()) if (!seen.has(id)) this.containersBefore.delete(id);

    return running.map((appId) => {
      const mine = containers.filter((c) => c.appId === appId);
      const missing = mine.some((c) => stats.get(c.id) === null);
      const sum: AppSample = { appId, cpu: 0, memBytes: 0, netRx: 0, netTx: 0, diskRead: 0, diskWrite: 0 };
      let rated = true;
      for (const c of mine) {
        const s = stats.get(c.id);
        if (!s) continue;
        const before = this.containersBefore.get(c.id);
        this.containersBefore.set(c.id, { at, totals: s });
        sum.cpu! += s.cpuPercent;
        sum.memBytes! += s.memBytes;
        const rates = (['netRxBytes', 'netTxBytes', 'diskReadBytes', 'diskWriteBytes'] as const).map((key) =>
          rate(before, at, s[key], key),
        );
        if (rates.some((v) => v === null)) rated = false;
        sum.netRx! += rates[0] ?? 0;
        sum.netTx! += rates[1] ?? 0;
        sum.diskRead! += rates[2] ?? 0;
        sum.diskWrite! += rates[3] ?? 0;
      }
      if (missing) {
        return { appId, cpu: null, memBytes: null, netRx: null, netTx: null, diskRead: null, diskWrite: null };
      }
      if (!rated) return { ...sum, netRx: null, netTx: null, diskRead: null, diskWrite: null };
      return { ...sum, cpu: Math.min(100, sum.cpu!) };
    });
  }
}

function toTotals(c: HostCounters): Totals {
  return {
    netRxBytes: c.netRxBytes,
    netTxBytes: c.netTxBytes,
    diskReadBytes: c.diskReadBytes,
    diskWriteBytes: c.diskWriteBytes,
  };
}
