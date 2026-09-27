import { useUiStrings } from '../lib/strings';
import { formatNumber } from './shared';

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Accessible description; defaults to "Trend, latest <value>". */
  label?: string;
}

const PAD = 5;

/** A tiny trend line without axes; the latest point is accent. Pair it with the value as text. */
export function Sparkline({ values, width = 120, height = 32, label }: SparklineProps) {
  const t = useUiStrings();
  const n = values.length;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i * (width - 2 * PAD)) / Math.max(1, n - 1);
  const y = (v: number) => PAD + (height - 2 * PAD) * (1 - (v - lo) / span);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values[n - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? t.trend(last === undefined ? '—' : formatNumber(last))}
    >
      <path d={d} fill="none" className="hl-spark-line" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {last !== undefined ? (
        <circle
          cx={x(n - 1)}
          cy={y(last)}
          r={4}
          style={{ fill: 'var(--accent)', stroke: 'var(--hl-chart-ring)' }}
          strokeWidth={2}
        />
      ) : null}
    </svg>
  );
}
