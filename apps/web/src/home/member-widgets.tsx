// A member's widgets (US-HOME-12): "My files" (the size of their Home folder; opens Files) and "Shared with you"
// (how many shared apps are running, and who to ask for another, or the App Store when members may install).
import { formatBytes, isFeatureEnabled } from '@hlabs/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { homeCopy as copy } from '../copy/home';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';

const CARD = 'hl-card hl-glass hl-glass-1 flex min-h-40 flex-col gap-3 text-left text-ink no-underline';
/** While the Home folder is first being counted, look again this often. */
const RECOUNT_MS = 2_000;

type MyFiles = { bytes: number | null; lastPhotoBackupAt: number | null };
type SharedApps = { total: number; running: number; adminName: string | null; canInstall: boolean };

function useWidget<T>(id: string, poll?: (data: T | undefined) => number | false) {
  const trpc = useTRPC();
  const q = useQuery({
    ...trpc.home.getWidgetData.queryOptions({ widgetIds: [id] }),
    retry: false,
    refetchInterval: (query) => poll?.(query.state.data?.[id]?.data as T | undefined) ?? false,
  });
  return { ...q, value: q.data?.[id]?.data as T | undefined };
}

export function sharedAppsLine(s: Pick<SharedApps, 'total' | 'running'>): string {
  if (s.total === 0) return copy.noAppsShared;
  return s.running === s.total ? copy.appsAllRunning(s.total) : copy.appsSomeRunning(s.running, s.total);
}

function Card({ title, children, to }: { title: string; children: ReactNode; to?: string }) {
  const body = (
    <>
      <h2 className="m-0 text-body-sm font-normal text-ink-muted">{title}</h2>
      {children}
    </>
  );
  return to ? (
    <Link to={to} className={`${CARD} hl-focus`}>
      {body}
    </Link>
  ) : (
    <div className={CARD}>{body}</div>
  );
}

export function MyFilesWidget({ shippedPhase }: { shippedPhase?: number }) {
  const files = useWidget<MyFiles>('my-files', (d) => (d && d.bytes === null ? RECOUNT_MS : false));
  const v = files.value;
  // Opens Files at their Home folder once Files ships (D-036).
  const to = isFeatureEnabled('files', shippedPhase) ? '/files' : undefined;
  return (
    <Card title={copy.myFiles} to={to}>
      <p className="m-0 flex flex-1 items-center gap-2">
        {v && v.bytes !== null ? (
          <>
            <span className="flex items-baseline gap-2">
              <span className="text-title-1 font-bold tabular-nums">{formatBytes(v.bytes)}</span>
              <span className="text-body-sm text-ink-muted">{copy.inHomeFolder}</span>
            </span>
          </>
        ) : (
          <span className="text-body text-ink-muted">{files.isError ? copy.couldntLoad : copy.calculating}</span>
        )}
      </p>
      {v?.lastPhotoBackupAt ? (
        <p className="m-0 text-body-sm text-ink-muted">{copy.lastPhotoBackup(timeAgo(v.lastPhotoBackupAt))}</p>
      ) : null}
    </Card>
  );
}

export function SharedAppsWidget() {
  const shared = useWidget<SharedApps>('shared-apps');
  const v = shared.value;
  const admin = v?.adminName ?? null;
  return (
    <Card title={admin ? copy.sharedBy(admin) : copy.sharedWithYou}>
      <p className="m-0 flex flex-1 items-center text-title-2 font-bold">
        {v ? sharedAppsLine(v) : shared.isError ? copy.couldntLoad : '…'}
      </p>
      {v?.canInstall ? (
        <Link
          to="/store"
          className="hl-focus self-start rounded-xs text-body-sm font-semibold text-accent-link no-underline"
        >
          {copy.browseStore}
        </Link>
      ) : v ? (
        <p className="m-0 text-body-sm text-ink-muted">{admin ? copy.askFor(admin) : copy.askAdmin}</p>
      ) : null}
    </Card>
  );
}
