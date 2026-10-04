// The per-app table (US-USE-06, US-USE-07, LiveUsage): each app this person can see with its CPU (its share of the
// whole computer, the same scale as the CPU tile), memory and network (in + out), and its status. Sorted by memory,
// most first, until another column is chosen; the order is re-evaluated at most every 10 s so rows don't jump while
// someone reads them. On a phone only App, the sorted column and Status show. An app that isn't running has no usage
// ("—") and sorts below every running app whichever way the table is sorted; its status says why, with a matching dot.
import type { UsageSample } from '@hlabs/api';
import { AppLogo, appTileLook } from '@hlabs/icons';
import type { AppState } from '@hlabs/api';
import { Button, StatusDot, tokens, type Status } from '@hlabs/ui';
import { useEffect, useMemo, useState } from 'react';
import { usageCopy as copy } from '../copy/usage';
import type { HomeApp } from '../home/home-app';
import { formatAppCpu, formatMemory, formatRate } from './format';
import { useTableSort, type Sort, type SortColumn } from './sort';

/** Rows keep their order this long while values change. */
export const ORDER_EVERY_MS = 10_000;
const LOGO = tokens.SPACE_7;
const COLUMNS: readonly SortColumn[] = ['app', 'cpu', 'memory', 'network', 'status'];
const METRICS = new Set<SortColumn>(['cpu', 'memory', 'network']);

export interface AppRow {
  app: HomeApp;
  cpu: number | null;
  memory: number | null;
  network: number | null;
}

export function appRows(apps: HomeApp[], sample: UsageSample | null): AppRow[] {
  const byId = new Map((sample?.apps ?? []).map((a) => [a.appId, a]));
  return apps.map((app) => {
    // Only running apps have usage; a stopped app's last values would mislead.
    const s = app.state === 'running' ? byId.get(app.id) : undefined;
    const net = s && s.netRx !== null && s.netTx !== null ? s.netRx + s.netTx : null;
    return { app, cpu: s?.cpu ?? null, memory: s?.memBytes ?? null, network: net };
  });
}

const statusText = (row: AppRow) => copy.appStatus[row.app.state];

/** The dot beside each status (US-USE-07): green running, amber on its way, red failed, grey stopped. */
export const STATUS_DOT: Record<AppState, Status> = {
  running: 'running',
  starting: 'working',
  restarting: 'working',
  stopping: 'working',
  updating: 'working',
  rolling_back: 'working',
  installing: 'working',
  uninstalling: 'working',
  error: 'failed',
  install_failed: 'failed',
  stopped: 'stopped',
};

function byColumn(sort: Sort, a: AppRow, b: AppRow): number {
  const sign = sort.dir === 'asc' ? 1 : -1;
  if (sort.column === 'app') return sign * a.app.name.localeCompare(b.app.name);
  if (sort.column === 'status') return sign * statusText(a).localeCompare(statusText(b));
  const x = a[sort.column];
  const y = b[sort.column];
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return sign * (x - y);
}

const notRunning = (row: AppRow) => (row.app.state === 'running' ? 0 : 1);

/** Compares two rows: running apps first either way, then by the sort (values not known last), then by name. */
export const compareRows = (sort: Sort) => (a: AppRow, b: AppRow) =>
  notRunning(a) - notRunning(b) || byColumn(sort, a, b) || a.app.name.localeCompare(b.app.name);

const sortedIds = (rows: AppRow[], sort: Sort) => [...rows].sort(compareRows(sort)).map((r) => r.app.id);

/**
 * The rows in sort order: re-sorted at once when the sort changes, an app comes or goes, or the first values arrive;
 * otherwise every 10 s, so rows don't jump while someone reads them.
 */
function useSteadyOrder(rows: AppRow[], sort: Sort): AppRow[] {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ORDER_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
  const apps = rows
    .map((r) => r.app.id)
    .sort()
    .join(',');
  const measured = rows.some((r) => r.memory !== null || r.cpu !== null);
  const key = `${sort.column}:${sort.dir}:${apps}:${measured}:${tick}`;
  const [kept, setKept] = useState(() => ({ key, ids: sortedIds(rows, sort) }));
  if (kept.key !== key) setKept({ key, ids: sortedIds(rows, sort) });
  const byId = new Map(rows.map((r) => [r.app.id, r]));
  const ids = kept.key === key ? kept.ids : sortedIds(rows, sort);
  return ids.flatMap((id) => byId.get(id) ?? []);
}

function AppName({ app }: { app: HomeApp }) {
  const look = appTileLook(app.name, app.icon, LOGO);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <AppLogo
        decorative
        name={app.name}
        src={app.icon.logoUrl}
        colors={look.colors}
        fallbackIcon={look.fallbackIcon}
        size={LOGO}
        radius={tokens.SPACE_2}
      />
      <span className="truncate">{app.name}</span>
    </span>
  );
}

export function AppTable({
  apps,
  current,
  onBrowseStore,
}: {
  apps: HomeApp[];
  current: UsageSample | null;
  /** "Browse the App Store" when there are no apps, for someone who may install them. */
  onBrowseStore?: () => void;
}) {
  const [sort, choose] = useTableSort();
  const rows = useSteadyOrder(
    useMemo(() => appRows(apps, current), [apps, current]),
    sort,
  );
  const heaviest = Math.max(0, ...rows.map((r) => r.memory ?? 0));
  // On a phone: App, the sorted column (memory when App or Status is sorted) and Status.
  const phoneMetric = METRICS.has(sort.column) ? sort.column : 'memory';
  const cell = (column: SortColumn) =>
    `px-4 py-3 ${METRICS.has(column) && column !== phoneMetric ? 'max-md:hidden' : ''}`;

  if (apps.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-lg bg-surface-row px-4 py-10 text-center">
        <h2 className="m-0 text-body font-semibold">{copy.noApps}</h2>
        {onBrowseStore ? <Button onClick={onBrowseStore}>{copy.browseStore}</Button> : null}
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg bg-surface-row">
      <table className="w-full border-collapse text-body-sm">
        <caption className="sr-only">{copy.appsTable}</caption>
        <thead>
          <tr className="border-b border-hairline text-left">
            {COLUMNS.map((column) => {
              const sorted = sort.column === column;
              return (
                <th
                  key={column}
                  scope="col"
                  aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`${cell(column)} text-caption font-semibold text-ink-muted`}
                >
                  <button
                    type="button"
                    onClick={() => choose(column)}
                    className="hl-focus -mx-1 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-sm px-1 font-semibold md:min-h-0"
                  >
                    {copy.columns[column]}
                    {sorted ? (
                      <span aria-hidden="true">{sort.dir === 'asc' ? copy.sortedUp : copy.sortedDown}</span>
                    ) : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.app.id} className="border-b border-hairline last:border-0">
              <th scope="row" className={`${cell('app')} text-left font-normal text-ink`}>
                <AppName app={row.app} />
              </th>
              <td className={`${cell('cpu')} tabular-nums`}>
                {row.cpu === null ? copy.noValue : formatAppCpu(row.cpu)}
              </td>
              <td className={`${cell('memory')} tabular-nums`}>
                {row.memory === null ? (
                  copy.noValue
                ) : (
                  <span className="flex items-center gap-3">
                    <span
                      className="h-1 w-20 overflow-hidden rounded-pill bg-surface-control max-md:hidden"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-pill bg-accent"
                        style={{ width: `${heaviest > 0 ? (row.memory / heaviest) * 100 : 0}%` }}
                      />
                    </span>
                    {formatMemory(row.memory)}
                  </span>
                )}
              </td>
              <td className={`${cell('network')} tabular-nums`}>
                {row.network === null ? copy.noValue : formatRate(row.network)}
              </td>
              <td className={cell('status')}>
                <StatusDot status={STATUS_DOT[row.app.state]}>{statusText(row)}</StatusDot>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
