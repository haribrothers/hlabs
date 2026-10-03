// Storage widget (US-HOME-02): free space as the big figure, and what uses the disk. Opens Usage.
import { formatBytes } from '@hlabs/shared';
import { RotateCw, iconDefaults } from '@hlabs/icons';
import { StackedBar } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { homeCopy } from '../copy/home';
import { useTRPC } from '../lib/trpc';

const copy = homeCopy;
const CARD = 'hl-card hl-glass hl-glass-1 flex min-h-40 flex-col gap-3 text-left text-ink no-underline';

export function StorageWidget() {
  const trpc = useTRPC();
  const summary = useQuery({ ...trpc.storage.summary.queryOptions(), retry: false });

  if (summary.isPending) {
    return (
      <div className={`${CARD} animate-pulse`} aria-busy="true">
        <h2 className="m-0 text-body-sm font-normal text-ink-muted">{copy.storage}</h2>
      </div>
    );
  }
  if (summary.isError) {
    return (
      <div className={CARD}>
        <h2 className="m-0 text-body-sm font-normal text-ink-muted">{copy.storage}</h2>
        <div className="flex items-center gap-2">
          <p className="m-0 text-body">{copy.couldntLoad}</p>
          <button
            type="button"
            className="hl-focus grid size-11 place-items-center rounded-pill bg-transparent text-ink"
            aria-label={copy.retry}
            onClick={() => void summary.refetch()}
          >
            <RotateCw aria-hidden {...iconDefaults} />
          </button>
        </div>
      </div>
    );
  }

  const s = summary.data;
  return (
    <Link to="/usage" className={`${CARD} hl-focus`}>
      <h2 className="m-0 text-body-sm font-normal text-ink-muted">{copy.storage}</h2>
      <p className="m-0 flex items-baseline gap-2">
        <span className="text-title-1 font-bold tabular-nums">{formatBytes(s.freeBytes)}</span>
        <span className="text-body-sm text-ink-muted">{copy.leftOf(formatBytes(s.totalBytes))}</span>
      </p>
      <StackedBar
        segments={[
          { label: copy.appsUsage, value: s.appsBytes },
          { label: copy.system, value: s.systemBytes },
        ]}
        total={s.totalBytes}
        formatValue={formatBytes}
        interactive={false}
      />
    </Link>
  );
}
