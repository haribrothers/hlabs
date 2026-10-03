// The main chart (US-USE-03, US-USE-04): the chosen metric over the chosen range. While another range loads, the
// previous chart stays, dimmed, rather than flashing empty; a range with less history shows what there is.
import type { UsagePoint } from '@hlabs/api';
import { LineChart } from '@hlabs/ui';
import { usageCopy as copy } from '../copy/usage';
import { formatPercent } from './format';
import { timeLabel, type UsageRange } from './range';

export function MainChart({ points, range, loading }: { points: UsagePoint[]; range: UsageRange; loading: boolean }) {
  const cpu = points.filter((p): p is UsagePoint & { cpu: number } => p.cpu !== null);
  const title = copy.chartTitle(copy.cpu, copy.over[range]);
  return (
    <section
      className={`rounded-lg bg-surface-row p-4 transition-opacity ${loading ? 'opacity-50' : ''}`}
      aria-busy={loading || undefined}
    >
      {cpu.length === 0 ? (
        <>
          <h2 className="m-0 text-body font-semibold">{title}</h2>
          {/* While it loads there is nothing to say yet; "no data" only once there really is none. */}
          <p className="m-0 py-10 text-center text-body-sm text-ink-muted">{loading ? ' ' : copy.noData}</p>
        </>
      ) : (
        <LineChart
          title={title}
          series={[{ name: copy.cpu, values: cpu.map((p) => p.cpu) }]}
          labels={cpu.map((p) => timeLabel(p.ts, range))}
          max={100}
          formatValue={formatPercent}
          width={960}
          height={180}
        />
      )}
    </section>
  );
}
