// Live usage widget (US-HOME-02, from phase 4; Phase 7 · Widgets): CPU and memory, each a row with its value and a
// thin accent bar, updating in place from usage.sample events. Memory says "9.4 / 16 GB", or a percent on a phone.
// Opens Usage.
import { homeCopy as copy } from '../copy/home';
import { formatMemory, formatPercent } from '../usage/format';
import { useLiveUsage } from '../usage/use-live-usage';
import { Bar, WidgetCard } from './widget-card';

const GIB = 1024 ** 3;

function Row({ label, value, phoneValue, pct }: { label: string; value: string; phoneValue?: string; pct: number }) {
  return (
    <div className="flex flex-col gap-1 md:gap-1.5">
      <div className="flex justify-between gap-2 text-caption md:text-label md:font-normal">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">
          {phoneValue ? (
            <>
              <span className="md:hidden">{phoneValue}</span>
              <span className="max-md:hidden">{value}</span>
            </>
          ) : (
            value
          )}
        </span>
      </div>
      <Bar thin parts={[{ pct, className: 'bg-accent' }]} />
    </div>
  );
}

export function LiveUsageWidget() {
  const { current } = useLiveUsage();
  const host = current.data?.host;
  const cpuPct = host?.cpu ?? null;
  const memPct = host?.memBytes != null && host.memTotalBytes ? (host.memBytes / host.memTotalBytes) * 100 : null;
  const memory =
    host?.memBytes != null
      ? copy.memoryUsedOf((host.memBytes / GIB).toFixed(1), formatMemory(host.memTotalBytes))
      : '—';
  return (
    <WidgetCard title={copy.liveUsage} target={{ to: '/usage' }} busy={current.isPending}>
      <div className="flex flex-col gap-2 md:gap-2.5">
        <Row label={copy.cpu} value={cpuPct != null ? formatPercent(cpuPct) : '—'} pct={cpuPct ?? 0} />
        <Row
          label={copy.memory}
          value={memory}
          phoneValue={memPct != null ? formatPercent(memPct) : '—'}
          pct={memPct ?? 0}
        />
      </div>
    </WidgetCard>
  );
}
