// Settings › Engine & startup (US-SYS-17…20): the container engine hlabs uses and the others on this computer, the
// resources given to apps, and startup behaviour. It follows engine.status live.
import { isFeatureEnabled } from '@hlabs/shared';
import { Button, List, ListRow, StatusDot, type Status } from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { engineCopy } from '../copy/engine';
import { useTRPC } from '../lib/trpc';
import { EngineRestartControl } from './engine-restart';
import { EngineResources } from './engine-resources';
import { StartupSettings } from './startup-settings';
import type { EngineOverview } from './engine-types';

export type { EngineOverview };

const copy = engineCopy;

const DOT: Record<EngineOverview['status'], Status> = {
  running: 'running',
  stopped: 'stopped',
  starting: 'working',
  missing: 'failed',
};

/** The engine overview, refreshed when the engine or an engine job changes (US-SYS-17: within 2 s). */
export function useEngineOverview() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: trpc.settings.engine.get.queryKey() });
  useSubscription(
    trpc.events.stream.subscriptionOptions({ types: ['engine.status', 'job.finished'] }, { onData: refresh }),
  );
  return useQuery({ ...trpc.settings.engine.get.queryOptions(), retry: false });
}

/** "Engine running" in the section header. */
export function EngineStatus() {
  const overview = useEngineOverview();
  if (!overview.data) return null;
  return (
    <span role="status" className="text-body-sm font-semibold">
      <StatusDot status={DOT[overview.data.status]}>{copy.status[overview.data.status]}</StatusDot>
    </span>
  );
}

export function engineDetail(overview: EngineOverview, engine: EngineOverview['engines'][number]): string {
  if (engine.availability === 'active') {
    if (overview.status === 'stopped') return copy.stopped;
    if (overview.active?.managedByHlabs) return copy.installedByHlabs;
    return overview.active?.version ? copy.inUseVersion(overview.active.version) : copy.inUse;
  }
  if (engine.availability === 'found') return overview.platform === 'darwin' ? copy.foundMac : copy.foundComputer;
  return copy.notInstalled;
}

export function EngineSection() {
  const overview = useEngineOverview();
  if (!overview.data) return null;
  const o = overview.data;
  return (
    <div className="flex flex-col gap-6">
      <List label={copy.containerEngine}>
        {o.engines.map((engine) => (
          <ListRow
            key={engine.kind}
            leading={
              <span
                aria-hidden="true"
                className={`grid size-5 place-items-center rounded-pill border-2 ${
                  engine.availability === 'active' ? 'border-accent' : 'border-ink-muted'
                }`}
              >
                {engine.availability === 'active' ? <span className="size-2 rounded-pill bg-accent" /> : null}
              </span>
            }
            title={
              <>
                {copy.names[engine.kind]}
                {engine.availability === 'active' ? (
                  <span className="sr-only">, {copy.inUse.toLowerCase()}</span>
                ) : null}
              </>
            }
            subtitle={engineDetail(o, engine)}
            trailing={
              engine.availability === 'active' ? (
                <EngineRestartControl stopped={o.status === 'stopped'} />
              ) : // Switching engines is US-SYS-21 (phase 9, D-036).
              engine.availability === 'found' && isFeatureEnabled('engineSwitch') ? (
                <Button variant="secondary" size="sm">
                  {copy.switch}
                </Button>
              ) : null
            }
          />
        ))}
      </List>
      {o.resources && o.active ? (
        // Keyed by the engine's values, so the sliders start again from what's applied.
        <EngineResources
          key={`${o.active.kind}:${o.resources.cpus}:${o.resources.memoryBytes}:${o.resources.diskBytes}`}
          resources={o.resources}
          engineName={copy.names[o.active.kind]}
        />
      ) : null}
      <StartupSettings />
    </div>
  );
}
