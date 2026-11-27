// A member's widgets (US-HOME-12; Phase 7 · Widgets): "My files" (the size of their Home folder; opens Files) and
// "Shared with you" (how many shared apps run, their logos, and who to ask for another, or the App Store when members
// may install).
import { formatBytes, isFeatureEnabled } from '@hlabs/shared';
import { iconDefaults, Smartphone } from '@hlabs/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { homeCopy as copy } from '../copy/home';
import { timeAgo } from '../lib/relative-time';
import { useTRPC } from '../lib/trpc';
import { AppLogos, Hero, HeroLine, Sub, WidgetCard, WidgetCouldntLoad, WidgetSkeleton } from './widget-card';

/** While the Home folder is first being counted, look again this often. */
const RECOUNT_MS = 2_000;

type NamedApp = {
  id: string;
  name: string;
  icon: { logoUrl: string | null; gradient: [string, string] | null; fallback: string | null };
};
type MyFiles = { bytes: number | null; lastPhotoBackupAt: number | null };
type SharedApps = {
  total: number;
  running: number;
  adminName: string | null;
  canInstall: boolean;
  apps?: NamedApp[];
};

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

export function MyFilesWidget({ shippedPhase }: { shippedPhase?: number }) {
  const files = useWidget<MyFiles>('my-files', (d) => (d && d.bytes === null ? RECOUNT_MS : false));
  const v = files.value;
  // Opens Files at their Home folder once Files ships (D-036).
  const target = isFeatureEnabled('files', shippedPhase) ? ({ to: '/files' } as const) : undefined;
  if (files.isPending) return <WidgetSkeleton title={copy.myFiles} />;
  if (files.isError) return <WidgetCouldntLoad title={copy.myFiles} retry={() => void files.refetch()} />;
  return (
    <WidgetCard title={copy.myFiles} target={target} busy={v?.bytes === null}>
      {v && v.bytes !== null ? (
        <Hero value={formatBytes(v.bytes)} unit={copy.inHomeFolder} />
      ) : (
        <HeroLine size="md">{copy.calculating}</HeroLine>
      )}
      {v?.lastPhotoBackupAt ? (
        <p className="m-0 flex min-w-0 items-center gap-1.5 text-caption text-ink-muted md:text-label md:font-normal">
          <Smartphone aria-hidden {...iconDefaults} className="size-3.5 shrink-0" />
          <span className="truncate">{copy.lastPhotoBackup(timeAgo(v.lastPhotoBackupAt))}</span>
        </p>
      ) : null}
    </WidgetCard>
  );
}

export function SharedAppsWidget() {
  const shared = useWidget<SharedApps>('shared-apps');
  const v = shared.value;
  if (shared.isPending) return <WidgetSkeleton title={copy.sharedWithYou} />;
  if (shared.isError || !v) return <WidgetCouldntLoad title={copy.sharedWithYou} retry={() => void shared.refetch()} />;
  const admin = v.adminName;
  const w = copy.widget;
  return (
    <WidgetCard title={admin ? copy.sharedBy(admin) : copy.sharedWithYou}>
      {v.total === 0 ? (
        <HeroLine size="md">{copy.noAppsShared}</HeroLine>
      ) : v.running === v.total ? (
        <Hero value={v.total} unit={`${w.apps(v.total)} · ${w.allRunningShort}`} />
      ) : (
        <Hero value={v.running} unit={w.ofRunning(v.total)} />
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        {v.apps?.length ? (
          <span className="max-md:hidden">
            <AppLogos apps={v.apps} />
          </span>
        ) : null}
        {v.canInstall ? (
          <Link
            to="/store"
            className="hl-focus self-start rounded-xs text-caption font-semibold text-accent-link no-underline md:text-label"
          >
            {copy.browseStore}
          </Link>
        ) : (
          <Sub>{admin ? copy.askFor(admin) : copy.askAdmin}</Sub>
        )}
      </div>
    </WidgetCard>
  );
}
