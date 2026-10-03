// The four summary tiles (US-USE-01): CPU, Memory, Storage and Network, each with its value, a line of context and a
// trend of the last samples. A value at 90% or more (CPU for 3 samples in a row, memory of the total) turns warning
// and says "High" in words too, never by colour alone.
import type { UsageOverview, UsagePoint, UsageSample } from '@hlabs/api';
import { Badge, Sparkline } from '@hlabs/ui';
import type { ReactNode } from 'react';
import { usageCopy as copy } from '../copy/usage';
import { formatMemory, formatPercent, formatRate } from './format';
import { formatBytes } from '@hlabs/shared';

/** How many recent samples the tile trends show. */
const TREND = 60;
const HIGH = 90;

export type TileId = 'cpu' | 'memory' | 'storage' | 'network';

function Tile({
  label,
  value,
  detail,
  trend,
  high = false,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  trend?: number[];
  high?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface-row p-4" aria-live="off">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm text-ink-muted">{label}</span>
        {high ? <Badge tone="warning">{copy.high}</Badge> : null}
      </div>
      <span className={`text-title-2 font-bold tabular-nums ${high ? 'text-warning' : 'text-ink'}`}>{value}</span>
      <span className="truncate text-caption text-ink-muted">{detail}</span>
      {trend && trend.length > 1 ? (
        <div className="mt-1">
          <Sparkline values={trend} width={160} height={28} decorative />
        </div>
      ) : null}
    </div>
  );
}

const known = (values: Array<number | null | undefined>) => values.filter((v): v is number => typeof v === 'number');

export function UsageTiles({
  current,
  overview,
  points,
}: {
  current: UsageSample | null;
  overview: UsageOverview | null;
  /** The chosen range's host points, for the trends and the CPU "High" rule. */
  points: UsagePoint[];
}) {
  const host = current?.host;
  const recent = points.slice(-TREND);
  const lastCpu = known(recent.slice(-3).map((p) => p.cpu));
  const cpuHigh = lastCpu.length === 3 && lastCpu.every((v) => v >= HIGH);
  const memTotal = overview?.memTotalBytes ?? host?.memTotalBytes ?? 0;
  const memHigh = host?.memBytes != null && memTotal > 0 && (host.memBytes / memTotal) * 100 >= HIGH;
  const byApps = (current?.apps ?? []).reduce((sum, a) => sum + (a.memBytes ?? 0), 0);
  const storage = overview?.storage;

  return (
    <div role="group" aria-label={copy.summary} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label={copy.cpu}
        value={host?.cpu != null ? formatPercent(host.cpu) : copy.noValue}
        detail={overview ? copy.cores(overview.cpuModel, overview.cores) : ''}
        trend={known(recent.map((p) => p.cpu))}
        high={cpuHigh}
      />
      <Tile
        label={copy.memory}
        value={host?.memBytes != null ? formatMemory(host.memBytes) : copy.noValue}
        detail={memTotal ? copy.memoryOf(formatMemory(memTotal), formatMemory(byApps)) : ''}
        trend={known(recent.map((p) => p.memBytes))}
        high={memHigh}
      />
      <Tile
        label={copy.storage}
        value={storage ? formatBytes(storage.usedBytes) : copy.noValue}
        detail={storage ? copy.storageOf(formatBytes(storage.totalBytes)) : ''}
      />
      <Tile
        label={copy.network}
        value={host?.netRx != null ? formatRate(host.netRx) : copy.noValue}
        detail={copy.networkDetail(host?.netTx != null ? formatRate(host.netTx) : copy.noValue)}
        trend={known(recent.map((p) => p.netRx))}
      />
    </div>
  );
}
