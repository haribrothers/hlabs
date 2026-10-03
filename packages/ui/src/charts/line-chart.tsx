import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useUiStrings } from '../lib/strings';
import { formatNumber, Legend, niceMax, seriesColor, showLabel, SrTable } from './shared';

export interface LineChartProps {
  /** One to six series; one series gets an area wash and no legend. */
  series: { name: string; values: number[] }[];
  /** One x label per value. */
  labels: string[];
  title?: string;
  /** Appended to values: '%', ' GB', ' MB/s'. */
  unit?: string;
  /** Fixed y max (100 for percentages). */
  max?: number;
  area?: boolean;
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
}

const PAD = { left: 44, right: 16, top: 10, bottom: 26 };

/** Values over time. Crosshair and tooltip on hover or arrow keys; a hidden table for screen readers. */
export function LineChart({
  series,
  labels,
  title,
  unit = '',
  max,
  area = true,
  width = 560,
  height = 200,
  formatValue,
}: LineChartProps) {
  const t = useUiStrings();
  const [idx, setIdx] = useState<number | null>(null);
  const n = labels.length;
  const fmt = formatValue ?? ((v: number) => formatNumber(v) + unit);
  const hi = Math.max(0, ...series.flatMap((s) => s.values));
  const top = max ?? niceMax(hi);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const step = (width - PAD.left - PAD.right) / Math.max(1, n - 1);
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : i * step);
  const y = (v: number) => PAD.top + (height - PAD.top - PAD.bottom) * (1 - v / top);
  const every = Math.max(1, Math.ceil(n / 6));
  const single = series.length === 1;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) * width) / (r.width || width);
    setIdx(Math.max(0, Math.min(n - 1, Math.round((px - PAD.left) / step))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setIdx(idx === null ? 0 : Math.min(n - 1, idx + 1));
    else if (e.key === 'ArrowLeft') setIdx(idx === null ? n - 1 : Math.max(0, idx - 1));
    else if (e.key === 'Escape') setIdx(null);
    else return;
    e.preventDefault();
  };

  return (
    <figure className="hl-chart">
      {title ? <figcaption className="hl-chart-title">{title}</figcaption> : null}
      {series.length > 1 ? (
        <Legend line items={series.map((s, i) => ({ name: s.name, color: seriesColor(i) }))} />
      ) : null}
      <div className="hl-chart-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label={`${title ?? t.chartData}. ${t.chartHint}`}
          tabIndex={0}
          onMouseMove={onMove}
          onMouseLeave={() => setIdx(null)}
          onKeyDown={onKey}
          onBlur={() => setIdx(null)}
        >
          {ticks.map((v, i) => (
            <g key={`g${i}`}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
                className="hl-chart-grid"
                strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="hl-chart-axis">
                {fmt(v)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            showLabel(i, n, every) ? (
              <text
                key={`x${i}`}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                className="hl-chart-axis"
              >
                {l}
              </text>
            ) : null,
          )}
          {series.map((s, si) => {
            const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
            const color = seriesColor(si);
            return (
              <g key={s.name}>
                {single && area ? (
                  <path d={`${d} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`} style={{ fill: color }} opacity={0.12} />
                ) : null}
                <path
                  d={d}
                  fill="none"
                  style={{ stroke: color }}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          {idx !== null ? (
            <g data-testid="crosshair">
              <line
                x1={x(idx)}
                x2={x(idx)}
                y1={PAD.top}
                y2={height - PAD.bottom}
                className="hl-chart-cross"
                strokeWidth={1}
              />
              {series.map((s, si) => (
                <circle
                  key={s.name}
                  cx={x(idx)}
                  cy={y(s.values[idx] ?? 0)}
                  r={4.5}
                  style={{ fill: seriesColor(si), stroke: 'var(--hl-chart-ring)' }}
                  strokeWidth={2}
                />
              ))}
            </g>
          ) : null}
        </svg>
        {idx !== null ? (
          <div
            className="hl-chart-tip"
            role="status"
            style={{
              left: `${(x(idx) / width) * 100}%`,
              transform: `translateX(${x(idx) > width * 0.6 ? 'calc(-100% - 12px)' : '12px'})`,
            }}
          >
            <div className="hl-chart-tip-title">{labels[idx]}</div>
            {series.map((s, si) => (
              <div key={s.name} className="hl-chart-tip-row">
                <span className="hl-chart-swatch" style={{ background: seriesColor(si) }} />
                <span className="hl-chart-tip-name">{s.name}</span>
                <b>{fmt(s.values[idx] ?? 0)}</b>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <SrTable
        caption={title ?? t.chartData}
        columns={[t.chartTime, ...series.map((s) => s.name)]}
        rows={labels.map((l, i) => [l, ...series.map((s) => fmt(s.values[i] ?? 0))])}
      />
    </figure>
  );
}
