// The widgets beyond Storage and Live usage (US-HOME-02, 19, 20), as Phase 7 · Widgets draws them: Remote access,
// Backups, App status, Updates, and apps' own widgets. Each card names its state top right (in colour and words), shows
// one main figure, and ends with what's behind it or what to do next.
import type { AppWidgetData } from '@hlabs/api';
import { AppLogo, appTileLook, Check, iconDefaults } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { tokens } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { homeCopy } from '../copy/home';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { useOpenApp } from './use-open-app';
import {
  AppLogos,
  Bar,
  Chips,
  GoOn,
  Hero,
  HeroLine,
  RunBars,
  Sub,
  WidgetCard,
  WidgetCouldntLoad,
  WidgetSkeleton,
  WidgetState,
} from './widget-card';
import { useAppOverlay } from '../apps/app-overlay';

const copy = homeCopy;
const w = copy.widget;
/** How often an app widget asks again while Home is showing (US-HOME-20); paused while the tab is hidden. */
export const APP_WIDGET_REFRESH_MS = 60_000;
/** How many recent backups the Backups widget draws. */
export const RECENT_RUNS = 7;
const numbers = new Intl.NumberFormat('en');
const clock = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false });

/** "Connected" on a computer, "On" where two widgets share a phone's width. */
function Short({ long, short }: { long: string; short: string }) {
  return (
    <>
      <span className="md:hidden">{short}</span>
      <span className="max-md:hidden">{long}</span>
    </>
  );
}

/** Remote access (US-HOME-02): the tailnet, how many devices are online, the DNS server and HTTPS. Opens Settings › Network. */
export function RemoteAccessWidget() {
  const trpc = useTRPC();
  const status = useQuery({ ...trpc.network.status.queryOptions(), retry: false });
  if (status.isPending) return <WidgetSkeleton title={copy.remoteAccess} />;
  if (status.isError) return <WidgetCouldntLoad title={copy.remoteAccess} retry={() => void status.refetch()} />;
  const { remote: r, dns } = status.data;
  const target = { to: '/settings/$section', params: { section: 'network' } } as const;
  if (r.state !== 'connected') {
    return (
      <WidgetCard title={copy.remoteAccess} state={<WidgetState tone="muted">{copy.off}</WidgetState>} target={target}>
        <HeroLine size="md">{w.remoteOffLine}</HeroLine>
        <GoOn>{copy.setUpRemote}</GoOn>
      </WidgetCard>
    );
  }
  // The dashboard's address on the tailnet (US-HOME-02, D-012).
  const name = r.url ? new URL(r.url).host : (r.tailnet ?? '');
  const devices = r.devicesOnline;
  const chips = [...(dns.kind !== 'none' ? [w.dnsChip[dns.kind]] : []), w.https];
  return (
    <WidgetCard
      title={copy.remoteAccess}
      state={
        <WidgetState tone="ok">
          <Short long={copy.connected} short={w.on} />
        </WidgetState>
      }
      target={target}
    >
      <HeroLine
        sub={
          devices !== null ? <Short long={w.tailscaleDevices(devices)} short={w.devices(devices)} /> : copy.tailscale
        }
      >
        {name}
      </HeroLine>
      <Chips items={chips} />
    </WidgetCard>
  );
}

/** Backups (US-HOME-02): when the last one worked, what goes where, and the recent runs; a failure, a backup going on,
 * or "Not set up". Opens Backups. */
export function BackupsWidget() {
  const trpc = useTRPC();
  const overview = useQuery({ ...trpc.backups.overview.queryOptions(), retry: false });
  if (overview.isPending) return <WidgetSkeleton title={copy.backups} />;
  if (overview.isError) return <WidgetCouldntLoad title={copy.backups} retry={() => void overview.refetch()} />;
  const o = overview.data;
  const target = { to: '/backups' } as const;
  const where = o.destinations[0]?.name ?? null;
  if (!where) {
    return (
      <WidgetCard title={copy.backups} state={<WidgetState tone="warn">{copy.notSetUp}</WidgetState>} target={target}>
        <HeroLine sub={<span className="max-md:hidden">{w.noCopy}</span>}>{w.notBackedUpYet}</HeroLine>
        <GoOn>{w.chooseWhere}</GoOn>
      </WidgetCard>
    );
  }
  const recent = o.chart.slice(-RECENT_RUNS);
  const most = Math.max(1, ...recent.map((r) => r.bytesAdded ?? 0));
  const runs = recent.map((r) => ({
    failed: r.status === 'failed',
    height: Math.max(0.3, (r.bytesAdded ?? 0) / most),
  }));
  if (o.running) {
    return (
      <WidgetCard
        title={copy.backups}
        state={
          <WidgetState tone="accent" short={w.working}>
            {w.backingUp}
          </WidgetState>
        }
        target={target}
      >
        <Hero value={`${Math.round(o.running.progress)}%`} unit={o.running.message ?? where} />
        <Bar parts={[{ pct: o.running.progress, className: 'bg-accent' }]} />
      </WidgetCard>
    );
  }
  const apps = o.included.apps === 1 ? '1 app' : `${o.included.apps} apps`;
  if (o.lastRun?.status === 'failed') {
    const dest = o.lastRun.destinationName ?? where;
    return (
      <WidgetCard title={copy.backups} state={<WidgetState tone="bad">{w.failed}</WidgetState>} target={target}>
        <HeroLine
          sub={
            <>
              {o.lastRun.error === 'BACKUP_DEST_UNREACHABLE' ? w.couldntReach(dest) : w.couldntFinish}
              <span className="max-md:hidden">
                {' · '}
                {o.lastSuccessAt ? w.lastWorkedShort(timeAgo(o.lastSuccessAt)) : w.neverWorkedShort}
              </span>
            </>
          }
        >
          {copy.lastBackupFailed}
        </HeroLine>
        <RunBars runs={runs} />
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title={copy.backups} target={target}>
      <HeroLine sub={<Short long={copy.backupLine(o.included.apps, where)} short={w.backupTo(apps, where)} />}>
        {o.lastSuccessAt ? timeAgo(o.lastSuccessAt) : copy.notYet}
      </HeroLine>
      {runs.length ? <RunBars runs={runs} /> : null}
    </WidgetCard>
  );
}

type WidgetEntry = { status: 'ok' | 'app_not_running' | 'error' | 'needs_key'; data?: unknown; updatedAt: number };
type NamedApp = {
  id: string;
  name: string;
  icon: { logoUrl: string | null; gradient: [string, string] | null; fallback: string | null };
};

function useWidgetData(id: string, refetchInterval?: number) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.home.getWidgetData.queryOptions({ widgetIds: [id] }),
    select: (d) => d[id] as WidgetEntry | undefined,
    retry: false,
    ...(refetchInterval ? { refetchInterval } : {}),
  });
}

/** App status (US-HOME-19): how many apps run, a bar of running, stopped and needing attention, and which. Opens Usage. */
export function AppStatusWidget() {
  const data = useWidgetData('app-status');
  if (data.isPending) return <WidgetSkeleton title={copy.appStatus} />;
  if (data.isError || data.data?.status !== 'ok')
    return <WidgetCouldntLoad title={copy.appStatus} retry={() => void data.refetch()} />;
  const s = data.data.data as {
    running: number;
    stopped: number;
    attention: number;
    notRunning?: Array<NamedApp & { state: string }>;
  };
  const total = Math.max(1, s.running + s.stopped + s.attention);
  const named = s.notRunning ?? [];
  const firstAttention = named.find((a) => a.state !== 'stopped');
  const firstStopped = named.find((a) => a.state === 'stopped');
  const line = s.attention
    ? w.couldntStart(firstAttention?.name ?? '')
    : s.stopped
      ? w.stoppedNamed(s.stopped, firstStopped?.name ?? '')
      : w.allRunning;
  return (
    <WidgetCard
      title={copy.appStatus}
      state={
        s.attention ? (
          <WidgetState tone="warn" short={w.needsYou}>
            {w.needsAttention(s.attention)}
          </WidgetState>
        ) : (
          <WidgetState tone="ok">{w.allGood}</WidgetState>
        )
      }
      target={{ to: '/usage' }}
    >
      <Hero value={numbers.format(s.running)} unit={copy.running} />
      <div className="flex flex-col gap-1.5 md:gap-2">
        <Bar
          label={line}
          parts={[
            { pct: (s.running / total) * 100, className: 'bg-success' },
            { pct: (s.stopped / total) * 100, className: 'bg-ink-muted' },
            { pct: (s.attention / total) * 100, className: 'bg-warning' },
          ]}
        />
        <Sub className="max-md:hidden">{line}</Sub>
      </div>
    </WidgetCard>
  );
}

/** Updates (US-HOME-19): how many app updates wait, which apps, and Review. Opens the App Store's Updates. */
export function UpdatesWidget() {
  const data = useWidgetData('updates');
  if (data.isPending) return <WidgetSkeleton title={copy.updates} />;
  if (data.isError || data.data?.status !== 'ok')
    return <WidgetCouldntLoad title={copy.updates} retry={() => void data.refetch()} />;
  const { count, apps = [] } = data.data.data as { count: number; apps?: NamedApp[] };
  const target = isFeatureEnabled('appUpdates') ? ({ to: '/store/updates' } as const) : ({ to: '/store' } as const);
  if (count === 0) {
    return (
      <WidgetCard
        title={copy.updates}
        state={
          <WidgetState tone="ok" icon={<Check aria-hidden {...iconDefaults} className="size-3.5" />}>
            {w.upToDate}
          </WidgetState>
        }
        target={target}
      >
        <HeroLine>{w.allUpToDate}</HeroLine>
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title={copy.updates} target={target}>
      <div className="flex min-w-0 flex-col gap-1">
        <Hero value={count} unit={w.appUpdates(count)} />
        <Sub className="max-md:hidden">{apps.map((a) => a.name).join(', ')}</Sub>
      </div>
      <div className="flex items-center justify-between gap-2">
        <AppLogos apps={apps} stacked />
        <GoOn>{w.review}</GoOn>
      </div>
    </WidgetCard>
  );
}

function Figures({
  pairs,
  muted = false,
}: {
  pairs: Array<{ value: string | number; label: string }>;
  muted?: boolean;
}) {
  // Two figures share a phone card at a smaller size; one takes the width.
  const two = pairs.length > 1;
  return (
    <div className={`grid min-w-0 gap-3 ${two ? 'grid-cols-2' : 'grid-cols-1'} ${muted ? 'opacity-45' : ''}`}>
      {pairs.map((p, i) => (
        <p key={i} className="m-0 flex min-w-0 flex-col gap-0.5">
          <span className={`truncate font-bold tabular-nums md:text-title-1 ${two ? 'text-headline' : 'text-title-2'}`}>
            {typeof p.value === 'number' ? numbers.format(p.value) : p.value}
          </span>
          <span className="truncate text-caption text-ink-muted md:text-label md:font-normal">{p.label}</span>
        </p>
      ))}
    </div>
  );
}

/** An app widget's template filled in: text only, so an app can't put markup on Home (US-HOME-20). */
export function AppWidgetBody({ data, muted = false }: { data: AppWidgetData; muted?: boolean }) {
  if (data.template === 'stat') return <Figures pairs={[data.value]} muted={muted} />;
  if (data.template === 'twoStat') return <Figures pairs={[data.first, data.second]} muted={muted} />;
  return (
    <ul className={`m-0 flex list-none flex-col gap-1.5 p-0 md:gap-2 ${muted ? 'opacity-45' : ''}`}>
      {data.rows.map((r, i) => (
        <li key={i} className="flex min-w-0 justify-between gap-3 text-caption md:text-label md:font-normal">
          <span className="truncate font-semibold">{r.title}</span>
          {r.detail ? <span className="shrink-0 text-ink-muted">{r.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * An app's own widget (US-HOME-20): its logo and name, the figures, refreshed every minute while Home is visible;
 * "Stopped" when the app is, "Couldn't load" with the last figures greyed and their time, and for an admin a way to add
 * the API key it needs. Opens the app as its tile does.
 */
export function AppWidget({ id }: { id: string }) {
  const trpc = useTRPC();
  const isAdmin = useMe().data?.role === 'admin';
  const openApp = useOpenApp(isAdmin);
  const overlay = useAppOverlay();
  const appId = id.split(':')[1] ?? '';
  const catalog = useQuery({ ...trpc.home.listWidgets.queryOptions(), retry: false });
  const appsList = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  const data = useWidgetData(id, APP_WIDGET_REFRESH_MS);
  const entry = catalog.data?.apps.find((x) => x.id === id);
  const app = appsList.data?.apps.find((a) => a.id === appId);
  const appName = entry?.appName ?? app?.name ?? '';
  const d = data.data;
  const stopped = d?.status === 'app_not_running';
  const size = tokens.SPACE_5;
  const look = app ? appTileLook(app.name, app.icon, size) : null;
  const title: ReactNode = (
    <span className="flex min-w-0 items-center gap-2">
      {app && look ? (
        <span className={stopped ? 'grayscale' : ''}>
          <AppLogo
            decorative
            name={app.name}
            src={app.icon.logoUrl}
            colors={look.colors}
            fallbackIcon={look.fallbackIcon}
            size={size}
            radius={tokens.SPACE_1 + tokens.SPACE_1 / 2}
          />
        </span>
      ) : null}
      {entry ? (
        <span className="truncate">
          {/* On a phone the logo names the app. */}
          <span className="max-md:sr-only">{copy.appWidgetTitle(entry.appName, '')}</span>
          {entry.name}
        </span>
      ) : (
        <span className="truncate">{appName}</span>
      )}
    </span>
  );

  if (data.isPending) return <WidgetSkeleton title={title} />;
  if (d?.status === 'needs_key' && isAdmin) {
    return (
      <WidgetCard title={title} target={{ onClick: () => overlay.openSettings(appId) }}>
        <HeroLine size="md">{w.addKeyLine}</HeroLine>
        <GoOn>{w.addKey}</GoOn>
      </WidgetCard>
    );
  }
  const open = { onClick: () => (app ? openApp(app) : undefined) };
  if (data.isError || !d || d.status === 'needs_key') {
    return (
      <WidgetCard title={title} state={<WidgetState tone="warn">{w.couldntLoadState}</WidgetState>} target={open}>
        <HeroLine size="md">{copy.couldntLoad}</HeroLine>
      </WidgetCard>
    );
  }
  if (stopped) {
    return (
      <WidgetCard title={title} state={<WidgetState tone="muted">{w.stoppedState}</WidgetState>} target={open}>
        <HeroLine size="md" sub={<span className="max-md:hidden">{w.appStopped}</span>}>
          {copy.appNotRunning(appName)}
        </HeroLine>
      </WidgetCard>
    );
  }
  if (d.status === 'error') {
    return (
      <WidgetCard title={title} state={<WidgetState tone="warn">{w.couldntLoadState}</WidgetState>} target={open}>
        {d.data ? (
          <AppWidgetBody data={d.data as AppWidgetData} muted />
        ) : (
          <HeroLine size="md">{copy.couldntLoad}</HeroLine>
        )}
        {d.data ? <Sub className="max-md:hidden">{w.figuresFrom(clock.format(d.updatedAt))}</Sub> : null}
      </WidgetCard>
    );
  }
  return (
    <WidgetCard title={title} target={open}>
      <AppWidgetBody data={d.data as AppWidgetData} />
    </WidgetCard>
  );
}
