// The main chart (US-USE-03, US-USE-04): the metric of the selected tile over the chosen range, with its peak. CPU and
// network are lines (network: In and Out, its peak the higher of the two), memory is stacked columns of the five apps using the most and "Other", and
// storage is one bar by use (no history, so no peak). While another range loads, the previous chart stays, dimmed,
// rather than flashing empty; a range with less history shows what there is.
import type { MemoryByApp, UsageOverview, UsagePoint } from '@hlabs/api';
import { formatBytes } from '@hlabs/shared';
import { LineChart, StackedBar, StackedColumns } from '@hlabs/ui';
import { usageCopy as copy } from '../copy/usage';
import { formatMemory, formatPercent, formatRate } from './format';
import type { ReactNode } from 'react';
import { timeLabel, type UsageRange } from './range';
import type { TileId } from './tiles';

type Metric = 'cpu' | 'memBytes' | 'netRx' | 'netTx';

/** The highest known value of a metric and when it was, or null without data. */
export function peakOf(points: UsagePoint[], metric: Metric): { ts: number; value: number } | null {
  let peak: { ts: number; value: number } | null = null;
  for (const p of points) {
    const v = p[metric];
    if (v !== null && (peak === null || v > peak.value)) peak = { ts: p.ts, value: v };
  }
  return peak;
}

function peakLine(points: UsagePoint[], metric: Metric, range: UsageRange, format: (v: number) => string) {
  const peak = peakOf(points, metric);
  return peak ? copy.peak(format(peak.value), timeLabel(peak.ts, range), range === '7d') : undefined;
}

/** Network's peak is the higher of in and out, and says which. */
function networkPeak(points: UsagePoint[], range: UsageRange) {
  const rx = peakOf(points, 'netRx');
  const tx = peakOf(points, 'netTx');
  const [peak, direction] = tx && (!rx || tx.value > rx.value) ? [tx, 'out' as const] : [rx, 'in' as const];
  if (!peak) return undefined;
  return copy.peak(copy.peakDirection(formatRate(peak.value), direction), timeLabel(peak.ts, range), range === '7d');
}

const SIZE = { width: 960, height: 180 } as const;

export function MainChart({
  metric,
  points,
  range,
  loading,
  memory,
  storage,
  memTotalBytes,
}: {
  metric: TileId;
  /** The host's points over the range. */
  points: UsagePoint[];
  range: UsageRange;
  loading: boolean;
  memory: MemoryByApp | undefined;
  storage: UsageOverview['storage'] | undefined;
  memTotalBytes: number;
}) {
  const known = points.filter((p) => (metric === 'network' ? p.netRx !== null || p.netTx !== null : true));
  const labels = known.map((p) => timeLabel(p.ts, range));
  const name = { cpu: copy.cpu, memory: copy.memory, network: copy.network, storage: copy.storage }[metric];
  const title = copy.chartTitle(name, copy.over[range]);

  let chart: ReactNode = null;
  if (metric === 'storage') {
    chart = storage ? (
      <StackedBar
        title={copy.storageByUse}
        total={storage.totalBytes}
        formatValue={formatBytes}
        segments={[
          { label: copy.apps, value: storage.appsBytes },
          { label: copy.files, value: storage.filesBytes },
          { label: copy.system, value: storage.systemBytes },
        ]}
      />
    ) : null;
  } else if (metric === 'cpu') {
    const cpu = points.filter((p): p is UsagePoint & { cpu: number } => p.cpu !== null);
    chart = cpu.length ? (
      <LineChart
        title={title}
        aside={peakLine(cpu, 'cpu', range, formatPercent)}
        series={[{ name: copy.cpu, values: cpu.map((p) => p.cpu) }]}
        labels={cpu.map((p) => timeLabel(p.ts, range))}
        max={100}
        formatValue={formatPercent}
        {...SIZE}
      />
    ) : null;
  } else if (metric === 'network') {
    chart = known.length ? (
      <LineChart
        title={title}
        aside={networkPeak(known, range)}
        series={[
          { name: copy.netIn, values: known.map((p) => p.netRx ?? 0) },
          { name: copy.netOut, values: known.map((p) => p.netTx ?? 0) },
        ]}
        labels={labels}
        formatValue={formatRate}
        {...SIZE}
      />
    ) : null;
  } else if (memory && memory.ts.length) {
    chart = (
      <StackedColumns
        title={title}
        aside={peakLine(points, 'memBytes', range, formatMemory)}
        series={[
          ...memory.series.map((s) => ({ name: s.name, values: s.values })),
          { name: copy.other, values: memory.other },
        ]}
        labels={memory.ts.map((ts) => timeLabel(ts, range))}
        max={memTotalBytes || undefined}
        formatValue={formatMemory}
        {...SIZE}
      />
    );
  }

  return (
    <section
      className={`rounded-lg bg-surface-row p-4 transition-opacity ${loading ? 'opacity-50' : ''}`}
      aria-busy={loading || undefined}
    >
      {chart ?? (
        <>
          <h2 className="m-0 text-body font-semibold">{metric === 'storage' ? copy.storageByUse : title}</h2>
          {/* While it loads there is nothing to say yet; "no data" only once there really is none. */}
          <p className="m-0 py-10 text-center text-body-sm text-ink-muted">{loading ? ' ' : copy.noData}</p>
        </>
      )}
    </section>
  );
}
