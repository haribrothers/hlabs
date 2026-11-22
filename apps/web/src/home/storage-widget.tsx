// Storage widget (US-HOME-02; Phase 7 · Widgets): free space as the main figure, one bar of what apps (accent) and the
// system (soft white) use, and a one-line legend. "Almost full" in amber under a tenth free. Opens Usage.
import { formatBytes } from '@hlabs/shared';
import { useQuery } from '@tanstack/react-query';
import { homeCopy } from '../copy/home';
import { useTRPC } from '../lib/trpc';
import { Bar, Hero, WidgetCard, WidgetCouldntLoad, WidgetSkeleton, WidgetState } from './widget-card';

const copy = homeCopy;
/** Under this share free, the widget says "Almost full". */
export const ALMOST_FULL = 0.1;

export function StorageWidget() {
  const trpc = useTRPC();
  const summary = useQuery({ ...trpc.storage.summary.queryOptions(), retry: false });
  if (summary.isPending) return <WidgetSkeleton title={copy.storage} />;
  if (summary.isError) return <WidgetCouldntLoad title={copy.storage} retry={() => void summary.refetch()} />;

  const s = summary.data;
  const pct = (bytes: number) => (s.totalBytes ? (bytes / s.totalBytes) * 100 : 0);
  const almostFull = s.totalBytes > 0 && s.freeBytes / s.totalBytes < ALMOST_FULL;
  return (
    <WidgetCard
      title={copy.storage}
      state={
        almostFull ? (
          <WidgetState tone="warn" short={copy.widget.lowSpace}>
            {copy.widget.almostFull}
          </WidgetState>
        ) : null
      }
      target={{ to: '/usage' }}
    >
      <div className="flex flex-col gap-2 md:gap-2.5">
        <Hero value={formatBytes(s.freeBytes)} unit={copy.leftOf(formatBytes(s.totalBytes))} />
        <Bar
          label={`${copy.appsUsage} ${formatBytes(s.appsBytes)}, ${copy.system} ${formatBytes(s.systemBytes)}`}
          parts={[
            { pct: pct(s.appsBytes), className: 'bg-accent' },
            { pct: pct(s.systemBytes), className: 'bg-ink-muted' },
          ]}
        />
        <p className="m-0 flex gap-3.5 text-caption text-ink-muted max-md:hidden">
          <span>
            {copy.appsUsage} {formatBytes(s.appsBytes)}
          </span>
          <span>
            {copy.system} {formatBytes(s.systemBytes)}
          </span>
        </p>
      </div>
    </WidgetCard>
  );
}
