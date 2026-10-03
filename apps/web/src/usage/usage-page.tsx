// Live usage (US-USE-01…07, LiveUsage): how busy this computer is. The title and the engine it runs apps in, a time
// range, four tiles (CPU, memory, storage, network), the main chart and the per-app table.
import type { UsageOverview } from '@hlabs/api';
import { GlassCard, Segmented } from '@hlabs/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usageCopy as copy } from '../copy/usage';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';
import { formatMemory } from './format';
import { AppTable } from './app-table';
import { MainChart } from './main-chart';
import { RANGES, useUsageRange, type UsageRange } from './range';
import { UsageTiles, type TileId } from './tiles';
import { useLiveUsage } from './use-live-usage';

/** "Container VM (Colima) · 4 CPUs · 8 GB allocated", "Docker Engine · uses the whole computer". */
export function engineLine(engine: UsageOverview['engine']): string {
  if (!engine.kind || !engine.running) return copy.noEngine;
  if (engine.kind === 'docker-engine') return copy.dockerEngine;
  const memory = engine.memoryBytes ? formatMemory(engine.memoryBytes) : '';
  const cpus = engine.cpus ?? 0;
  if (engine.kind === 'colima') return copy.colimaVm(cpus, memory);
  return copy.engineLimits(copy.engineNames[engine.kind] ?? engine.kind, cpus, memory);
}

export function UsagePage() {
  const trpc = useTRPC();
  const [range, setRange] = useUsageRange();
  // A member who may not see usage gets "You don't have access to this" (US-USE-02, US-STATE-20).
  const overview = useQuery({ ...trpc.usage.overview.queryOptions(), ...pageQuery, retry: false });
  const { current, hour: hostHour, apps } = useLiveUsage({ withHistory: true, withApps: true });
  // 1 hour follows the live samples; 24 hours and 7 days are fetched again every minute (US-USE-03).
  const longer = useQuery({
    ...trpc.usage.history.queryOptions({ scope: 'host', range }),
    enabled: range !== '1h',
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    retry: false,
  });
  const [metric, setMetric] = useState<TileId>('cpu');
  // Memory by app (US-USE-04), only while the memory chart shows.
  const memory = useQuery({
    ...trpc.usage.memoryByApp.queryOptions({ range }),
    enabled: metric === 'memory',
    placeholderData: keepPreviousData,
    refetchInterval: range === '1h' ? 10_000 : 60_000,
    retry: false,
  });
  const history = range === '1h' ? hostHour : longer;
  const points = history.data?.points ?? [];
  const switching =
    (range !== '1h' && (longer.isPlaceholderData || longer.isPending)) ||
    (metric === 'memory' && (memory.isPlaceholderData || memory.isPending));

  useEffect(() => {
    document.title = copy.docTitle;
  }, []);

  return (
    <GlassCard level={2} className="mx-auto flex w-full max-w-window flex-col gap-5 p-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-title-1">{copy.title}</h1>
          <p className="m-0 text-body-sm text-ink-muted">{overview.data ? engineLine(overview.data.engine) : ' '}</p>
        </div>
        <Segmented
          aria-label={copy.range}
          value={range}
          onChange={(v) => setRange(v as UsageRange)}
          options={RANGES.map((value) => ({ value, label: copy.ranges[value] }))}
        />
      </header>
      <UsageTiles
        current={current.data ?? null}
        overview={overview.data ?? null}
        points={points}
        selected={metric}
        onSelect={setMetric}
      />
      <MainChart
        metric={metric}
        points={points}
        range={range}
        loading={switching}
        memory={memory.data}
        storage={overview.data?.storage}
        memTotalBytes={overview.data?.memTotalBytes ?? current.data?.host.memTotalBytes ?? 0}
      />
      {apps.data ? <AppTable apps={apps.data.apps} current={current.data ?? null} /> : null}
    </GlassCard>
  );
}
