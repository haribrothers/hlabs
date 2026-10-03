// Live usage (US-USE-01…07, LiveUsage): how busy this computer is. The title and the engine it runs apps in, a time
// range, four tiles (CPU, memory, storage, network), the main chart and the per-app table.
import type { UsageOverview } from '@hlabs/api';
import { GlassCard, Segmented } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usageCopy as copy } from '../copy/usage';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';
import { formatMemory } from './format';
import { UsageTiles } from './tiles';
import { useLiveUsage } from './use-live-usage';

export type UsageRange = '1h' | '24h' | '7d';

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
  const [range, setRange] = useState<UsageRange>('1h');
  // A member who may not see usage gets "You don't have access to this" (US-USE-02, US-STATE-20).
  const overview = useQuery({ ...trpc.usage.overview.queryOptions(), ...pageQuery, retry: false });
  const { current, hour: hostHour } = useLiveUsage({ withHistory: true });

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
          options={(['1h', '24h', '7d'] as const).map((value) => ({ value, label: copy.ranges[value] }))}
        />
      </header>
      <UsageTiles
        current={current.data ?? null}
        overview={overview.data ?? null}
        points={hostHour.data?.points ?? []}
      />
    </GlassCard>
  );
}
