import { useState } from 'react';
import { StatusDot } from '../components/status-dot';
import { useUiStrings } from '../lib/strings';
import { formatNumber, niceMax, showLabel, SrTable } from './shared';

export interface BarDatum {
  label: string;
  value: number;
  status?: 'failed' | 'warning';
  statusText?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  title?: string;
  unit?: string;
  valueLabel?: string;
  max?: number;
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
}

const PAD = { left: 44, right: 12, top: 18, bottom: 26 };
const BAR_MAX = 24;
const COLOR = { failed: 'var(--danger)', warning: 'var(--warning)' } as const;

/** Columns over days or runs; failed runs turn danger and get an ×, so failure never relies on colour. */
export function BarChart({
  data,
  title,
  unit = '',
  valueLabel,
  max,
  width = 560,
  height = 180,
  formatValue,
}: BarChartProps) {
  const t = useUiStrings();
  const [idx, setIdx] = useState<number | null>(null);
  const n = data.length;
  const fmt = formatValue ?? ((v: number) => formatNumber(v) + unit);
  const top = max ?? niceMax(Math.max(0, ...data.map((d) => d.value)));
  const band = (width - PAD.left - PAD.right) / Math.max(1, n);
  const bw = Math.min(BAR_MAX, band * 0.62);
  const y = (v: number) => PAD.top + (height - PAD.top - PAD.bottom) * (1 - v / top);
  const every = Math.max(1, Math.ceil(n / 8));
  const label = valueLabel ?? t.value;
  const current = idx === null ? null : data[idx];

  return (
    <figure className="hl-chart">
      {title ? <figcaption className="hl-chart-title">{title}</figcaption> : null}
      <div className="hl-chart-plot">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" aria-label={title ?? t.chartData}>
          {[0, 0.5, 1].map((f, i) => (
            <g key={`g${i}`}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(f * top)}
                y2={y(f * top)}
                className="hl-chart-grid"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(f * top) + 4} textAnchor="end" className="hl-chart-axis">
                {fmt(f * top)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const x0 = cx - bw / 2;
            const topY = y(d.value);
            const base = y(0);
            const r = Math.min(4, bw / 2, Math.max(0, base - topY));
            const path = `M${x0} ${base} V${topY + r} Q${x0} ${topY} ${x0 + r} ${topY} H${x0 + bw - r} Q${x0 + bw} ${topY} ${x0 + bw} ${topY + r} V${base} Z`;
            return (
              <g
                key={i}
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${fmt(d.value)}${d.status === 'failed' ? `, ${t.failed.toLowerCase()}` : ''}`}
                onMouseEnter={() => setIdx(i)}
                onMouseLeave={() => setIdx(null)}
                onFocus={() => setIdx(i)}
                onBlur={() => setIdx(null)}
              >
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={height - PAD.top - PAD.bottom}
                  fill="transparent"
                />
                <path
                  d={path}
                  style={{ fill: d.status ? COLOR[d.status] : 'var(--chart-1)' }}
                  opacity={idx === null || idx === i ? 1 : 0.55}
                />
                {d.status === 'failed' ? (
                  <path
                    d={`M${cx - 3.5} ${topY - 12} l7 7 m0 -7 l-7 7`}
                    style={{ stroke: 'var(--danger)' }}
                    strokeWidth={2}
                    strokeLinecap="round"
                    data-testid="failed-mark"
                  />
                ) : null}
                {showLabel(i, n, every) ? (
                  <text x={cx} y={height - 6} textAnchor="middle" className="hl-chart-axis">
                    {d.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {current && idx !== null ? (
          <div
            className="hl-chart-tip"
            style={{
              left: `${((PAD.left + band * idx + band / 2) / width) * 100}%`,
              top: 4,
              transform: `translateX(${PAD.left + band * idx > width * 0.6 ? 'calc(-100% - 16px)' : '16px'})`,
            }}
          >
            <div className="hl-chart-tip-title">{current.label}</div>
            <div className="hl-chart-tip-row">
              <span className="hl-chart-tip-name">{label}</span>
              <b>{fmt(current.value)}</b>
            </div>
            {current.status ? (
              <div className="hl-chart-tip-row">
                <StatusDot status={current.status === 'failed' ? 'failed' : 'working'}>
                  {current.statusText ?? (current.status === 'failed' ? t.failed : t.succeeded)}
                </StatusDot>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <SrTable
        caption={title ?? t.chartData}
        columns={['', label]}
        rows={data.map((d) => [d.label, fmt(d.value) + (d.status === 'failed' ? ` (${t.failed.toLowerCase()})` : '')])}
      />
    </figure>
  );
}
