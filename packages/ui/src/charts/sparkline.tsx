import { useId } from 'react';
import { useUiStrings } from '../lib/strings';
import { formatNumber, SrTable } from './shared';

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Accessible description; defaults to "Trend, latest <value>". */
  label?: string;
  /** One label per value for its hidden table (times); positions 1, 2, 3… when left out. */
  labels?: string[];
  formatValue?: (v: number) => string;
  /** Hidden from screen readers when the value beside it already says it (a stat tile, US-USE-05). */
  decorative?: boolean;
}

const PAD = 5;

/**
 * A tiny trend line without axes; the latest point is accent. Pair it with the value as text. Unless decorative, a
 * hidden table of its values is linked with aria-describedby (US-USE-05).
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  label,
  labels,
  formatValue = formatNumber,
  decorative = false,
}: SparklineProps) {
  const t = useUiStrings();
  const tableId = useId();
  const n = values.length;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i * (width - 2 * PAD)) / Math.max(1, n - 1);
  const y = (v: number) => PAD + (height - 2 * PAD) * (1 - (v - lo) / span);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values[n - 1];
  const svg = (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'img',
            'aria-label': label ?? t.trend(last === undefined ? '—' : formatValue(last)),
            'aria-describedby': tableId,
          })}
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
  if (decorative) return svg;
  return (
    <>
      {svg}
      <SrTable
        id={tableId}
        caption={label ?? t.chartData}
        columns={[t.chartTime, t.value]}
        rows={values.map((v, i) => [labels?.[i] ?? String(i + 1), formatValue(v)])}
      />
    </>
  );
}
