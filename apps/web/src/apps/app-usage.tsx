// App settings › Usage (US-APP-20, US-APP-21; the AppUsageDetail screen): three tiles (CPU with today's average, memory
// with its 24-hour peak, disk as data plus image) that follow usage.sample every 5 s; a 24-hour LineChart of CPU, memory
// or network (in and out) whose last point moves on each minute, with gaps where the app wasn't running; and each
// container with its memory, CPU and download rate, a row opening the logs filtered to that container.
import type { AppDetail, AppUsageDetail, ContainerStatus, UsageHistory, UsagePoint, UsageSample } from '@hlabs/api';
import { formatBytes } from '@hlabs/shared';
import { Button, LineChart, List, ListRow, Segmented, StatusDot, type Status } from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { appUsageCopy as copy } from '../copy/app-usage';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';
import { useNow } from '../lib/use-now';
import { formatAppCpu, formatMemory, formatPercent, formatRate } from '../usage/format';
import { timeLabel } from '../usage/range';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** The chart's points: 5-minute averages of the 1m history, 288 over the day. */
export const BUCKET_MS = 5 * MINUTE;
/** The chart's last point moves on each minute (US-APP-20). */
export const CHART_REFRESH_MS = MINUTE;
/** An app this new has too little history to draw. */
export const COLLECTING_MS = 10 * MINUTE;
/** x labels every 6 hours, ending at "now". */
const TICK_HOURS = 6;
/** A 6-hour label this close to "now" would run into it. */
const TICK_CLEARANCE_MS = 90 * MINUTE;
const MB = 1e6;
const KB = 1e3;

export type ChartMetric = 'cpu' | 'memory' | 'network';
const METRICS: readonly ChartMetric[] = ['cpu', 'memory', 'network'];

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

/** Averages of the known values in each bucket of the day ending at `now`; null where there were none (a gap). */
export function bucketize(
  points: readonly UsagePoint[],
  now: number,
  pick: (p: UsagePoint) => number | null,
): { starts: number[]; values: Array<number | null> } {
  const count = DAY / BUCKET_MS;
  const from = now - DAY;
  const sums = new Array<number>(count).fill(0);
  const counts = new Array<number>(count).fill(0);
  for (const p of points) {
    const v = pick(p);
    const i = Math.floor((p.ts - from) / BUCKET_MS);
    if (v === null || i < 0 || i >= count) continue;
    sums[i]! += v;
    counts[i]! += 1;
  }
  return {
    starts: sums.map((_, i) => from + i * BUCKET_MS),
    values: sums.map((sum, i) => (counts[i] ? sum / counts[i]! : null)),
  };
}

/** The x axis: each local 00:00, 06:00, 12:00 and 18:00 in the day, and "now" at the end. */
export function dayTicks(starts: readonly number[], now: number): Array<{ index: number; label: string }> {
  const ticks: Array<{ index: number; label: string }> = [];
  const first = new Date(starts[0] ?? now);
  first.setMinutes(0, 0, 0);
  for (let t = first.getTime(); t < now - TICK_CLEARANCE_MS; t += HOUR) {
    if (t < (starts[0] ?? now) || new Date(t).getHours() % TICK_HOURS !== 0) continue;
    ticks.push({ index: Math.floor((t - starts[0]!) / BUCKET_MS), label: timeLabel(t, '24h') });
  }
  ticks.push({ index: starts.length - 1, label: copy.now });
  return ticks;
}

function average(values: ReadonlyArray<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}

/** The app's tab: tiles, the chart and its containers. */
export function AppUsage({ app, onOpenLogs }: { app: AppDetail; onOpenLogs: (service: string) => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const detailKey = trpc.usage.appDetail.queryKey({ appId: app.id });
  const detail = useQuery({ ...trpc.usage.appDetail.queryOptions({ appId: app.id }), ...pageQuery });
  // Every metric comes with each point, so switching the chart needs no new request.
  const history = useQuery({
    ...trpc.usage.history.queryOptions({ scope: app.id, range: '24h' }),
    refetchInterval: CHART_REFRESH_MS,
  });
  const [metric, setMetric] = useState<ChartMetric>('memory');

  // Tiles move with each sample at once; the containers' figures are asked for again (US-APP-20, US-APP-21).
  useEventStream((event) => {
    if (event.type !== 'usage.sample' || !visible()) return;
    const sample: UsageSample = event.data;
    queryClient.setQueryData(detailKey, (old: AppUsageDetail | undefined) =>
      old ? { ...old, current: sample.apps.find((a) => a.appId === app.id) ?? null } : old,
    );
    void queryClient.invalidateQueries({ queryKey: detailKey });
  });

  if (detail.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 text-body text-ink-muted">{copy.couldntLoad}</p>
        <Button variant="secondary" onClick={() => void detail.refetch()}>
          {copy.retry}
        </Button>
      </div>
    );
  }
  const data = detail.data;
  return (
    <div className="flex flex-col gap-6">
      <Tiles detail={data} />
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Segmented
            aria-label={copy.chartMetric}
            options={METRICS.map((m) => ({ value: m, label: copy[m] }))}
            value={metric}
            onChange={(v) => setMetric(v as ChartMetric)}
          />
        </div>
        <UsageChart
          metric={metric}
          history={history.data}
          updatedAt={history.dataUpdatedAt}
          installedAt={data?.installedAt ?? null}
        />
      </div>
      {data && data.containers.length ? <Containers containers={data.containers} onOpenLogs={onOpenLogs} /> : null}
    </div>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface-row p-4">
      <span className="text-body-sm text-ink-muted">{label}</span>
      <span className="text-title-2 font-bold tabular-nums text-ink">{value}</span>
      <span className="truncate text-caption text-ink-muted">{detail}</span>
    </div>
  );
}

function Tiles({ detail }: { detail: AppUsageDetail | undefined }) {
  const current = detail?.current ?? null;
  const memNow = current?.memBytes ?? null;
  // The peak is never below what it uses right now (the history lags by up to a minute).
  const peak = detail?.memPeak24h != null || memNow !== null ? Math.max(detail?.memPeak24h ?? 0, memNow ?? 0) : null;
  const disk = detail?.disk;
  return (
    <div role="group" aria-label={copy.tiles} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile
        label={copy.cpu}
        value={current?.cpu != null ? formatPercent(current.cpu) : copy.noValue}
        detail={detail?.cpuAvgToday != null ? copy.avgToday(formatAppCpu(detail.cpuAvgToday)) : ''}
      />
      <Tile
        label={copy.memory}
        value={memNow !== null ? formatMemory(memNow) : copy.noValue}
        detail={peak !== null ? copy.peak(formatMemory(peak)) : ''}
      />
      <Tile
        label={copy.disk}
        value={disk ? formatBytes(disk.dataBytes + disk.imageBytes) : detail ? copy.counting : copy.noValue}
        detail={disk ? copy.dataAndImage : ''}
      />
    </div>
  );
}

const roundTo = (v: number) => Math.round(v * 10) / 10;

function UsageChart({
  metric,
  history,
  updatedAt,
  installedAt,
}: {
  metric: ChartMetric;
  history: UsageHistory | undefined;
  updatedAt: number;
  installedAt: number | null;
}) {
  const name = copy[metric];
  const title = copy.chartTitle(name);
  const unit = copy.units[metric];
  const clock = useNow().getTime();
  // The day ends when the history was read, so the grid moves on with each minute's request.
  const now = updatedAt || clock;
  const collecting = installedAt !== null && clock - installedAt < COLLECTING_MS;
  const points = history?.points ?? [];

  const scale = (bytes: number | null, by: number) => (bytes === null ? null : roundTo(bytes / by));
  const series =
    metric === 'network'
      ? [
          { name: copy.netIn, ...bucketize(points, now, (p) => scale(p.netRx, KB)) },
          { name: copy.netOut, ...bucketize(points, now, (p) => scale(p.netTx, KB)) },
        ]
      : [
          {
            name,
            ...bucketize(points, now, (p) =>
              metric === 'cpu' ? (p.cpu === null ? null : roundTo(p.cpu)) : scale(p.memBytes, MB),
            ),
          },
        ];
  const starts = series[0]!.starts;
  const hasData = series.some((s) => s.values.some((v) => v !== null));
  const format = (v: number) => (metric === 'cpu' ? `${roundTo(v)}%` : `${roundTo(v).toLocaleString()} ${unit}`);

  let summary = '';
  if (hasData && metric === 'network') {
    summary = copy.networkSummary(format(average(series[0]!.values) ?? 0), format(average(series[1]!.values) ?? 0));
  } else if (hasData) {
    const values = series[0]!.values;
    let top = -1;
    values.forEach((v, i) => {
      if (v !== null && (top === -1 || v > values[top]!)) top = i;
    });
    summary = copy.summary(name, format(average(values) ?? 0), format(values[top]!), timeLabel(starts[top]!, '24h'));
  }

  return (
    <section aria-label={title} className="flex flex-col gap-2 rounded-lg bg-surface-row p-4">
      {collecting || !hasData ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-body font-semibold">{title}</h2>
            <span className="text-caption text-ink-muted">{unit}</span>
          </div>
          <p className="m-0 py-10 text-center text-body-sm text-ink-muted">
            {collecting ? copy.collecting : history ? copy.noData : ' '}
          </p>
        </>
      ) : (
        <>
          <LineChart
            title={title}
            aside={unit}
            series={series.map((s) => ({ name: s.name, values: s.values }))}
            labels={starts.map((t) => timeLabel(t, '24h'))}
            xTicks={dayTicks(starts, now)}
            formatValue={format}
          />
          <p className="sr-only">
            {summary} {copy.stoppedGaps}
          </p>
        </>
      )}
    </section>
  );
}

const CONTAINER_DOT: Record<ContainerStatus, Status> = {
  running: 'running',
  restarting: 'working',
  paused: 'stopped',
  stopped: 'stopped',
  exited: 'stopped',
};

function Containers({
  containers,
  onOpenLogs,
}: {
  containers: AppUsageDetail['containers'];
  onOpenLogs: (service: string) => void;
}) {
  return (
    <List label={copy.containers}>
      {containers.map((c) => {
        const known = c.memBytes !== null || c.cpu !== null || c.netRx !== null;
        const line =
          c.status === 'running' && known
            ? copy.containerLine(
                c.memBytes !== null ? formatMemory(c.memBytes) : copy.noValue,
                c.cpu !== null ? formatPercent(c.cpu) : copy.noValue,
                c.netRx !== null ? formatRate(c.netRx) : copy.noValue,
              )
            : copy.containerStatus[c.status];
        return (
          <ListRow
            key={c.service}
            onPress={() => onOpenLogs(c.service)}
            hint={copy.showLogs(c.name)}
            title={
              <StatusDot status={CONTAINER_DOT[c.status]}>
                <span className="font-mono text-body-sm">{c.name}</span>
              </StatusDot>
            }
            trailing={<span className="shrink-0 text-body-sm tabular-nums text-ink-muted">{line}</span>}
          />
        );
      })}
    </List>
  );
}
