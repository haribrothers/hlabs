import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useUiStrings } from '../lib/strings';
import { formatNumber, Legend, niceMax, seriesColor, showLabel, SrTable } from './shared';

export interface StackedColumnsProps {
  /** Up to six series, stacked bottom to top in chart order (chart-1…chart-6). */
  series: { name: string; values: number[] }[];
  /** One x label per column. */
  labels: string[];
  title?: string;
  /** A note beside the title, e.g. "Peak 9.4 GB at 16:32". */
  aside?: string;
  /** Fixed y max (a total, e.g. the computer's memory). */
  max?: number;
  width?: number;
  height?: number;
  formatValue?: (v: number) => string;
}

const PAD = { left: 52, right: 16, top: 10, bottom: 26 };

/** Parts of a whole over time: one stacked column per point. Tooltip on hover or arrow keys; a hidden table. */
export function StackedColumns({
  series,
  labels,
  title,
  aside,
  max,
  width = 560,
  height = 200,
  formatValue,
}: StackedColumnsProps) {
  const t = useUiStrings();
  const [idx, setIdx] = useState<number | null>(null);
  const n = labels.length;
  const fmt = formatValue ?? formatNumber;
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const top = max ?? niceMax(Math.max(0, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const slot = (width - PAD.left - PAD.right) / Math.max(1, n);
  const gap = slot > 6 ? 2 : slot > 2 ? 1 : 0;
  const x = (i: number) => PAD.left + i * slot;
  const y = (v: number) => PAD.top + (height - PAD.top - PAD.bottom) * (1 - Math.min(v, top) / top);
  const every = Math.max(1, Math.ceil(n / 6));

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) * width) / (r.width || width);
    setIdx(Math.max(0, Math.min(n - 1, Math.floor((px - PAD.left) / slot))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setIdx(idx === null ? 0 : Math.min(n - 1, idx + 1));
    else if (e.key === 'ArrowLeft') setIdx(idx === null ? n - 1 : Math.max(0, idx - 1));
    else if (e.key === 'Escape') setIdx(null);
    else return;
    e.preventDefault();
  };
  const tipX = idx === null ? 0 : x(idx) + slot / 2;

  return (
    <figure className="hl-chart">
      {title ? (
        <figcaption className="hl-chart-title">
          {title}
          {aside ? <span className="hl-chart-sub">{aside}</span> : null}
        </figcaption>
      ) : null}
      <Legend items={series.map((s, i) => ({ name: s.name, color: seriesColor(i) }))} />
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
                x={x(i) + slot / 2}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                className="hl-chart-axis"
              >
                {l}
              </text>
            ) : null,
          )}
          {labels.map((_, i) => {
            let base = 0;
            return (
              <g key={`c${i}`} opacity={idx === null || idx === i ? 1 : 0.55}>
                {series.map((s, si) => {
                  const v = s.values[i] ?? 0;
                  const y0 = y(base);
                  base += v;
                  const y1 = y(base);
                  return v > 0 ? (
                    <rect
                      key={s.name}
                      x={x(i) + gap / 2}
                      y={y1}
                      width={Math.max(0.5, slot - gap)}
                      height={Math.max(0, y0 - y1)}
                      style={{ fill: seriesColor(si) }}
                    />
                  ) : null;
                })}
              </g>
            );
          })}
        </svg>
        {idx !== null ? (
          <div
            className="hl-chart-tip"
            role="status"
            style={{
              left: `${(tipX / width) * 100}%`,
              transform: `translateX(${tipX > width * 0.6 ? 'calc(-100% - 12px)' : '12px'})`,
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
