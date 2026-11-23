// Settings › Engine & startup (US-SYS-17…20): the container engine hlabs uses and the others on this computer, the
// resources given to apps, and startup behaviour. It follows engine.status live.
import { isFeatureEnabled } from '@hlabs/shared';
import { Check, CircleAlert, CircleCheck, CircleStop, iconDefaults, LoaderCircle, type LucideIcon } from '@hlabs/icons';
import { Button, List, ListRow, PhoneCard, StatusDot, type Status } from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { engineCopy } from '../copy/engine';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';
import { EngineRestartControl } from './engine-restart';
import { EngineResources } from './engine-resources';
import { StartupSettings } from './startup-settings';
import type { EngineOverview } from './engine-types';
import { useEventStream } from '../lib/use-event-stream';
import { useIsDesktop } from '../lib/use-media';

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
  useEventStream((event) => {
    if (event.type === 'engine.status' || event.type === 'job.finished') refresh();
  });
  return useQuery({ ...trpc.settings.engine.get.queryOptions(), retry: false, ...pageQuery });
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

/** The state's glyph and colour in the phone's engine card. */
const STATE_ICON: Record<EngineOverview['status'], { icon: LucideIcon; tone: string }> = {
  running: { icon: CircleCheck, tone: 'text-success' },
  stopped: { icon: CircleStop, tone: 'text-ink-muted' },
  starting: { icon: LoaderCircle, tone: 'text-accent' },
  missing: { icon: CircleAlert, tone: 'text-danger' },
};

/**
 * The engine's state on a phone (PhoneRedesignA_Engine): a card with its glyph, "Engine running" over the engine in
 * use, and Restart (or Start) at the right.
 */
function PhoneEngineCard({ o }: { o: EngineOverview }) {
  const { icon: Icon, tone } = STATE_ICON[o.status];
  const active = o.engines.find((e) => e.availability === 'active');
  return (
    <PhoneCard className="flex items-center gap-3">
      <span aria-hidden className={`grid size-11 shrink-0 place-items-center rounded-pill bg-surface-control ${tone}`}>
        <Icon {...iconDefaults} size={26} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span role="status" className="text-row font-semibold">
          {copy.status[o.status]}
        </span>
        {active ? <span className="text-footnote text-ink-muted">{copy.names[active.kind]}</span> : null}
      </span>
      {active ? <EngineRestartControl stopped={o.status === 'stopped'} /> : null}
    </PhoneCard>
  );
}

export function EngineSection() {
  const overview = useEngineOverview();
  const desktop = useIsDesktop();
  if (!overview.data) return null;
  const o = overview.data;
  if (!desktop)
    return (
      <div className="flex flex-col gap-6">
        <PhoneEngineCard o={o} />
        <List label={copy.containerEngine}>
          {o.engines.map((engine) => (
            <ListRow
              key={engine.kind}
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
                  <Check aria-hidden {...iconDefaults} className="shrink-0 text-accent-link" />
                ) : engine.availability === 'found' && isFeatureEnabled('engineSwitch') ? (
                  <Button variant="link" size="sm">
                    {copy.switch}
                  </Button>
                ) : null
              }
            />
          ))}
        </List>
        {o.resources && o.active ? (
          <EngineResources
            key={`${o.active.kind}:${o.resources.cpus}:${o.resources.memoryBytes}:${o.resources.diskBytes}`}
            resources={o.resources}
            engineName={copy.names[o.active.kind]}
          />
        ) : null}
        <StartupSettings />
      </div>
    );
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
