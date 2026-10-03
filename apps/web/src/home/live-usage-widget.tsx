// Live usage widget (US-HOME-02, from phase 4): CPU as a whole percent and memory used of the total, updating in place
// from usage.sample events. Opens Usage.
import { Link } from '@tanstack/react-router';
import { homeCopy as copy } from '../copy/home';
import { formatMemory, formatPercent } from '../usage/format';
import { useLiveUsage } from '../usage/use-live-usage';

const GIB = 1024 ** 3;
const CARD = 'hl-card hl-glass hl-glass-1 flex min-h-40 flex-col gap-3 text-left text-ink no-underline';

export function LiveUsageWidget() {
  const { current } = useLiveUsage();
  const host = current.data?.host;
  const cpu = host?.cpu != null ? formatPercent(host.cpu) : '—';
  const memory =
    host?.memBytes != null
      ? copy.memoryUsedOf((host.memBytes / GIB).toFixed(1), formatMemory(host.memTotalBytes))
      : '—';
  return (
    <Link to="/usage" className={`${CARD} hl-focus`} aria-busy={current.isPending || undefined}>
      <h2 className="m-0 text-body-sm font-normal text-ink-muted">{copy.liveUsage}</h2>
      <dl className="m-0 grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-ink-muted">{copy.cpu}</dt>
          <dd className="m-0 text-title-1 font-bold tabular-nums">{cpu}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-ink-muted">{copy.memory}</dt>
          <dd className="m-0 text-title-2 font-bold tabular-nums">{memory}</dd>
        </div>
      </dl>
    </Link>
  );
}
