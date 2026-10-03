import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useUiStrings } from '../lib/strings';
import {
  Announce,
  downsample,
  formatNumber,
  Legend,
  niceMax,
  patternFill,
  PatternDefs,
  pointText,
  seriesColor,
  showLabel,
  SrTable,
  stepKey,
  Swatch,
} from './shared';

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

/**
 * Parts of a whole over time: one stacked column per point. Left/Right (Home/End) step through the columns, Up/Down
 * through the series within one, each announced; a hidden table linked with aria-describedby. More than 500 points are
 * drawn, stepped and tabled as at most 200. In forced colours each series has its own fill pattern.
 */
export function StackedColumns({
  series: allSeries,
  labels: allLabels,
  title,
  aside,
  max,
  width = 560,
  height = 200,
  formatValue,
}: StackedColumnsProps) {
  const t = useUiStrings();
  const tableId = useId();
  const patternId = useId().replace(/:/g, '');
  const [idx, setIdx] = useState<number | null>(null);
  /** The series focused within the column (Up/Down); null: the whole column. */
  const [part, setPart] = useState<number | null>(null);
  const keep = downsample(allLabels.length, allSeries);
  const labels = keep.map((i) => allLabels[i]!);
  const series = allSeries.map((s) => ({ name: s.name, values: keep.map((i) => s.values[i] ?? 0) }));
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
  const at = idx !== null && idx < n ? idx : null;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) * width) / (r.width || width);
    setIdx(Math.max(0, Math.min(n - 1, Math.floor((px - PAD.left) / slot))));
    setPart(null);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (n === 0 || series.length === 0) return;
      e.preventDefault();
      if (at === null) setIdx(n - 1);
      const last = series.length - 1;
      // Up climbs the stack (chart-1 at the bottom), Down goes back down.
      if (e.key === 'ArrowUp') setPart(part === null ? 0 : Math.min(last, part + 1));
      else setPart(part === null ? last : Math.max(0, part - 1));
      return;
    }
    stepKey(e, n, at, (i) => {
      setIdx(i);
      if (i === null) setPart(null);
    });
  };
  const tipX = at === null ? 0 : x(at) + slot / 2;
  const announced =
    at === null
      ? ''
      : pointText(
          labels[at]!,
          (part === null ? series : [series[part]!]).map((s) => ({ name: s.name, value: fmt(s.values[at] ?? 0) })),
        );

  return (
    <figure className="hl-chart">
      {title ? (
        <figcaption className="hl-chart-title">
          {title}
          {aside ? <span className="hl-chart-sub">{aside}</span> : null}
        </figcaption>
      ) : null}
      <Legend names={series.map((s) => s.name)} />
      <div className="hl-chart-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label={`${title ?? t.chartData}. ${t.chartHintSeries}`}
          aria-describedby={tableId}
          tabIndex={0}
          onMouseMove={onMove}
          onMouseLeave={() => setIdx(null)}
          onKeyDown={onKey}
          onBlur={() => {
            setIdx(null);
            setPart(null);
          }}
        >
          <PatternDefs id={patternId} />
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
              <g key={`c${i}`} opacity={at === null || at === i ? 1 : 0.55}>
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
                      className="hl-chart-fill"
                      data-focused={at === i && part === si ? true : undefined}
                      style={{ fill: seriesColor(si), ['--hl-pattern' as string]: patternFill(patternId, si) }}
                    />
                  ) : null;
                })}
              </g>
            );
          })}
        </svg>
        {at !== null ? (
          <div
            className="hl-chart-tip"
            aria-hidden="true"
            style={{
              left: `${(tipX / width) * 100}%`,
              transform: `translateX(${tipX > width * 0.6 ? 'calc(-100% - 12px)' : '12px'})`,
            }}
          >
            <div className="hl-chart-tip-title">{labels[at]}</div>
            {series.map((s, si) => (
              <div key={s.name} className="hl-chart-tip-row" data-focused={part === si ? true : undefined}>
                <Swatch index={si} />
                <span className="hl-chart-tip-name">{s.name}</span>
                <b>{fmt(s.values[at] ?? 0)}</b>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <Announce text={announced} />
      <SrTable
        id={tableId}
        caption={title ?? t.chartData}
        columns={[t.chartTime, ...series.map((s) => s.name)]}
        rows={labels.map((l, i) => [l, ...series.map((s) => fmt(s.values[i] ?? 0))])}
      />
    </figure>
  );
}
