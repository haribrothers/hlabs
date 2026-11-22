// The widgets added with the picker (US-HOME-02, 19, 20): Remote access, Backups, App status, Updates, and apps' own
// widgets. Each is a level-1 glass card like Storage; one that can't load says so and can be tried again.
import { appTileLook, iconDefaults, RotateCw } from '@hlabs/icons';
import type { AppWidgetData } from '@hlabs/api';
import { StatusDot } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { homeCopy } from '../copy/home';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { useOpenApp } from './use-open-app';

const copy = homeCopy;
export const WIDGET_CARD = 'hl-card hl-glass hl-glass-1 flex min-h-40 flex-col gap-3 text-left text-ink no-underline';
/** How often an app widget asks again while Home is showing (US-HOME-20); paused while the tab is hidden. */
export const APP_WIDGET_REFRESH_MS = 60_000;
const numbers = new Intl.NumberFormat('en');

function Title({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-body-sm font-normal text-ink-muted">{children}</h2>;
}

/** A widget that couldn't load: what failed, and a way to try again. */
function CouldntLoad({ title, retry }: { title: ReactNode; retry: () => void }) {
  return (
    <div className={WIDGET_CARD}>
      <Title>{title}</Title>
      <div className="flex items-center gap-2">
        <p className="m-0 text-body">{copy.couldntLoad}</p>
        <button
          type="button"
          className="hl-focus grid size-11 place-items-center rounded-pill bg-transparent text-ink"
          aria-label={copy.retry}
          onClick={retry}
        >
          <RotateCw aria-hidden {...iconDefaults} />
        </button>
      </div>
    </div>
  );
}

function Loading({ title }: { title: ReactNode }) {
  return (
    <div className={`${WIDGET_CARD} animate-pulse`} aria-busy="true">
      <Title>{title}</Title>
    </div>
  );
}

/** Remote access (US-HOME-02): connected or not, and the address on the tailnet. Opens Settings › Network. */
export function RemoteAccessWidget() {
  const trpc = useTRPC();
  const status = useQuery({ ...trpc.network.status.queryOptions({ probe: false }), retry: false });
  if (status.isPending) return <Loading title={copy.remoteAccess} />;
  if (status.isError) return <CouldntLoad title={copy.remoteAccess} retry={() => void status.refetch()} />;
  const r = status.data.remote;
  const on = r.state === 'connected';
  return (
    <Link to="/settings/$section" params={{ section: 'network' }} className={`${WIDGET_CARD} hl-focus`}>
      <div className="flex items-center justify-between gap-2">
        <Title>{copy.remoteAccess}</Title>
        <StatusDot status={on ? 'running' : 'stopped'}>{on ? copy.connected : copy.off}</StatusDot>
      </div>
      {on ? (
        <>
          <p className="m-0 truncate text-title-2 font-bold">{r.url ? new URL(r.url).host : (r.tailnet ?? '')}</p>
          <p className="m-0 text-body-sm text-ink-muted">{copy.tailscale}</p>
        </>
      ) : (
        <p className="m-0 text-body text-ink-muted">{copy.setUpRemote}</p>
      )}
    </Link>
  );
}

/** Backups (US-HOME-02): when the last one worked, how many apps, where; a failure or "Not set up". Opens Backups. */
export function BackupsWidget() {
  const trpc = useTRPC();
  const overview = useQuery({ ...trpc.backups.overview.queryOptions(), retry: false });
  if (overview.isPending) return <Loading title={copy.backups} />;
  if (overview.isError) return <CouldntLoad title={copy.backups} retry={() => void overview.refetch()} />;
  const o = overview.data;
  const where = o.destinations[0]?.name ?? null;
  return (
    <Link to="/backups" className={`${WIDGET_CARD} hl-focus`}>
      <Title>{copy.backups}</Title>
      {!where ? (
        <p className="m-0 text-title-2 font-bold">{copy.notSetUp}</p>
      ) : o.lastRun?.status === 'failed' ? (
        <StatusDot status="failed">{copy.lastBackupFailed}</StatusDot>
      ) : (
        <>
          <p className="m-0 text-title-2 font-bold">{o.lastSuccessAt ? timeAgo(o.lastSuccessAt) : copy.notYet}</p>
          <p className="m-0 text-body-sm text-ink-muted">{copy.backupLine(o.included.apps, where)}</p>
        </>
      )}
    </Link>
  );
}

type WidgetEntry = { status: 'ok' | 'app_not_running' | 'error' | 'needs_key'; data?: unknown; updatedAt: number };

function useWidgetData(id: string, refetchInterval?: number) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.home.getWidgetData.queryOptions({ widgetIds: [id] }),
    select: (d) => d[id] as WidgetEntry | undefined,
    retry: false,
    ...(refetchInterval ? { refetchInterval } : {}),
  });
}

/** App status (US-HOME-19): how many apps run, are stopped or need looking at. Opens Usage's app list. */
export function AppStatusWidget() {
  const data = useWidgetData('app-status');
  if (data.isPending) return <Loading title={copy.appStatus} />;
  if (data.isError || data.data?.status !== 'ok')
    return <CouldntLoad title={copy.appStatus} retry={() => void data.refetch()} />;
  const s = data.data.data as { running: number; stopped: number; attention: number };
  return (
    <Link to="/usage" className={`${WIDGET_CARD} hl-focus`}>
      <Title>{copy.appStatus}</Title>
      <p className="m-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Figure value={s.running} label={copy.running} />
        <Figure value={s.stopped} label={copy.stopped} />
        {s.attention ? <Figure value={s.attention} label={copy.needAttention} /> : null}
      </p>
    </Link>
  );
}

/** Updates (US-HOME-19): how many app updates are waiting. Opens the App Store's updates. */
export function UpdatesWidget() {
  const data = useWidgetData('updates');
  if (data.isPending) return <Loading title={copy.updates} />;
  if (data.isError || data.data?.status !== 'ok')
    return <CouldntLoad title={copy.updates} retry={() => void data.refetch()} />;
  const { count } = data.data.data as { count: number };
  return (
    <Link to="/store" className={`${WIDGET_CARD} hl-focus`}>
      <Title>{copy.updates}</Title>
      <p className="m-0 text-title-2 font-bold">{copy.appUpdates(count)}</p>
    </Link>
  );
}

function Figure({ value, label, muted = false }: { value: string | number; label: string; muted?: boolean }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${muted ? 'opacity-50' : ''}`}>
      <span className="text-title-1 font-bold tabular-nums">
        {typeof value === 'number' ? numbers.format(value) : value}
      </span>
      <span className="text-body-sm font-semibold text-ink-muted">{label}</span>
    </span>
  );
}

/** An app widget's template filled in: text only, so an app can't put markup on Home (US-HOME-20). */
export function AppWidgetBody({ data, muted = false }: { data: AppWidgetData; muted?: boolean }) {
  if (data.template === 'stat') return <Figure value={data.value.value} label={data.value.label} muted={muted} />;
  if (data.template === 'twoStat') {
    return (
      <p className="m-0 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Figure value={data.first.value} label={data.first.label} muted={muted} />
        <Figure value={data.second.value} label={data.second.label} muted={muted} />
      </p>
    );
  }
  return (
    <ul className={`m-0 flex list-none flex-col gap-1 p-0 ${muted ? 'opacity-50' : ''}`}>
      {data.rows.map((r, i) => (
        <li key={i} className="flex min-w-0 justify-between gap-3 text-body-sm">
          <span className="truncate font-semibold">{r.title}</span>
          {r.detail ? <span className="truncate text-ink-muted">{r.detail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * An app's own widget (US-HOME-20): refreshed every minute while Home is visible, "<App> isn't running" when it's
 * stopped, "Couldn't load" (with the last good figures greyed) when it doesn't answer, and for an admin a way to add
 * the API key it needs. Opens the app as its tile does.
 */
export function AppWidget({ id }: { id: string }) {
  const trpc = useTRPC();
  const isAdmin = useMe().data?.role === 'admin';
  const openApp = useOpenApp(isAdmin);
  const appId = id.split(':')[1] ?? '';
  const catalog = useQuery({ ...trpc.home.listWidgets.queryOptions(), retry: false });
  const appsList = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  const data = useWidgetData(id, APP_WIDGET_REFRESH_MS);
  const entry = catalog.data?.apps.find((w) => w.id === id);
  const app = appsList.data?.apps.find((a) => a.id === appId);
  const title = entry ? copy.appWidgetTitle(entry.appName, entry.name) : (app?.name ?? '');
  const look = app ? appTileLook(app.name, app.icon) : null;

  if (data.isPending) return <Loading title={title} />;
  const d = data.data;
  const body: ReactNode =
    data.isError || !d ? (
      <p className="m-0 text-body">{copy.couldntLoad}</p>
    ) : d.status === 'app_not_running' ? (
      <p className="m-0 text-body text-ink-muted">{copy.appNotRunning(entry?.appName ?? app?.name ?? '')}</p>
    ) : d.status === 'needs_key' ? (
      <p className="m-0 text-body text-ink-muted">{copy.needsKey(entry?.appName ?? app?.name ?? '')}</p>
    ) : d.status === 'error' ? (
      <div className="flex flex-col gap-1">
        <p className="m-0 text-body-sm">{copy.couldntLoad}</p>
        {d.data ? <AppWidgetBody data={d.data as AppWidgetData} muted /> : null}
      </div>
    ) : (
      <AppWidgetBody data={d.data as AppWidgetData} />
    );
  const header = (
    <span className="flex items-center gap-2">
      {look ? <span aria-hidden className="size-3 shrink-0 rounded-xs" style={{ background: look.colors[0] }} /> : null}
      <Title>{title}</Title>
    </span>
  );
  // Adding the key happens in the app's settings (admins).
  if (d?.status === 'needs_key' && isAdmin) {
    return (
      <Link to="/apps/$appId/settings" params={{ appId }} state={{ from: '/' }} className={`${WIDGET_CARD} hl-focus`}>
        {header}
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => (app ? openApp(app) : undefined)}
      className={`${WIDGET_CARD} hl-focus cursor-pointer border-0`}
    >
      {header}
      {body}
    </button>
  );
}
