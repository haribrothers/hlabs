import { useId, useState, type MouseEvent } from 'react';
import { useUiStrings } from '../lib/strings';
import { useHoldTooltip } from './hold-tooltip';
import {
  Announce,
  downsample,
  formatNumber,
  Legend,
  niceMax,
  pointText,
  seriesColor,
  seriesDash,
  showLabel,
  SrTable,
  stepKey,
  Swatch,
} from './shared';

export interface LineChartProps {
  /**
   * One to six series; one series gets an area wash and no legend. A null value is a gap: the line breaks there (the
   * thing measured wasn't running), and its tooltip and table say "No data".
   */
  series: { name: string; values: Array<number | null> }[];
  /** One x label per value (the tooltip's and table's time). */
  labels: string[];
  /** The x axis's labels at these points instead of evenly spaced ones from `labels` (e.g. every 6 hours and "now"). */
  xTicks?: Array<{ index: number; label: string }>;
  title?: string;
  /** A note beside the title, e.g. "Peak 46% at 16:32". */
  aside?: string;
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

/**
 * Values over time. Crosshair and tooltip on hover or arrow keys (Home/End to the ends), each point announced; a
 * hidden table linked with aria-describedby. More than 500 points are drawn, stepped and tabled as at most 200.
 */
export function LineChart({
  series: allSeries,
  labels: allLabels,
  title,
  aside,
  unit = '',
  max,
  area = true,
  width = 560,
  height = 200,
  formatValue,
  xTicks,
}: LineChartProps) {
  const t = useUiStrings();
  const tableId = useId();
  const [idx, setIdx] = useState<number | null>(null);
  const keep = downsample(allLabels.length, allSeries);
  const labels = keep.map((i) => allLabels[i]!);
  const series = allSeries.map((s) => ({ name: s.name, values: keep.map((i) => s.values[i] ?? null) }));
  const n = labels.length;
  const fmt = formatValue ?? ((v: number) => formatNumber(v) + unit);
  const fmtOrGap = (v: number | null | undefined) => (v === null || v === undefined ? t.chartNoData : fmt(v));
  const hi = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const top = max ?? niceMax(hi);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const step = (width - PAD.left - PAD.right) / Math.max(1, n - 1);
  const x = (i: number) => PAD.left + (n <= 1 ? 0 : i * step);
  const y = (v: number) => PAD.top + (height - PAD.top - PAD.bottom) * (1 - v / top);
  const every = Math.max(1, Math.ceil(n / 6));
  // Given ticks land on the nearest point kept after downsampling.
  const ticksAt = xTicks?.map((tick) => {
    const at = keep.findIndex((k) => k >= tick.index);
    return { i: at === -1 ? n - 1 : at, label: tick.label };
  });
  const single = series.length === 1;
  const at = idx !== null && idx < n ? idx : null;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) * width) / (r.width || width);
    setIdx(Math.max(0, Math.min(n - 1, Math.round((px - PAD.left) / step))));
  };

  // A finger held on the chart shows its tooltip (US-TAB-01).
  const hold = useHoldTooltip();
  return (
    <figure className="hl-chart" {...hold}>
      {title ? (
        <figcaption className="hl-chart-title">
          {title}
          {aside ? <span className="hl-chart-sub">{aside}</span> : null}
        </figcaption>
      ) : null}
      {series.length > 1 ? <Legend line names={series.map((s) => s.name)} /> : null}
      <div className="hl-chart-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label={`${title ?? t.chartData}. ${t.chartHint}`}
          aria-describedby={tableId}
          tabIndex={0}
          onMouseMove={onMove}
          onMouseLeave={() => setIdx(null)}
          onKeyDown={(e) => stepKey(e, n, at, setIdx)}
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
          {(ticksAt ?? labels.map((label, i) => ({ i, label })).filter(({ i }) => showLabel(i, n, every))).map(
            ({ i, label: l }) => (
              <text
                key={`x${i}`}
                x={x(i)}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                className="hl-chart-axis"
              >
                {l}
              </text>
            ),
          )}
          {series.map((s, si) => {
            const runs = segments(s.values);
            // A lone point between gaps is a zero-length line, which the round cap draws as a dot.
            const path = (run: number[]) =>
              run.map((i, j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s.values[i]!).toFixed(1)}`).join(' ') +
              (run.length === 1 ? ` L${x(run[0]!).toFixed(1)} ${y(s.values[run[0]!]!).toFixed(1)}` : '');
            const d = runs.map(path).join(' ');
            const color = seriesColor(si);
            return (
              <g key={s.name}>
                {single && area ? (
                  <path
                    className="hl-chart-area"
                    d={runs.map((run) => `${path(run)} L${x(run.at(-1)!)} ${y(0)} L${x(run[0]!)} ${y(0)} Z`).join(' ')}
                    style={{ fill: color }}
                    opacity={0.12}
                  />
                ) : null}
                <path
                  d={d}
                  fill="none"
                  className="hl-chart-line"
                  data-series={si}
                  style={{ stroke: color, ['--hl-dash' as string]: seriesDash(si) }}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          {at !== null ? (
            <g data-testid="crosshair">
              <line
                x1={x(at)}
                x2={x(at)}
                y1={PAD.top}
                y2={height - PAD.bottom}
                className="hl-chart-cross"
                strokeWidth={1}
              />
              {series.map((s, si) =>
                s.values[at] === null ? null : (
                  <circle
                    key={s.name}
                    cx={x(at)}
                    cy={y(s.values[at] ?? 0)}
                    r={4.5}
                    className="hl-chart-dot"
                    style={{ fill: seriesColor(si), stroke: 'var(--hl-chart-ring)' }}
                    strokeWidth={2}
                  />
                ),
              )}
            </g>
          ) : null}
        </svg>
        {at !== null ? (
          <div
            className="hl-chart-tip"
            aria-hidden="true"
            style={{
              left: `${(x(at) / width) * 100}%`,
              transform: `translateX(${x(at) > width * 0.6 ? 'calc(-100% - 12px)' : '12px'})`,
            }}
          >
            <div className="hl-chart-tip-title">{labels[at]}</div>
            {series.map((s, si) => (
              <div key={s.name} className="hl-chart-tip-row">
                <Swatch index={si} line />
                <span className="hl-chart-tip-name">{s.name}</span>
                <b>{fmtOrGap(s.values[at])}</b>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <Announce
        text={
          at === null
            ? ''
            : pointText(
                labels[at]!,
                series.map((s) => ({ name: s.name, value: fmtOrGap(s.values[at]) })),
              )
        }
      />
      <SrTable
        id={tableId}
        caption={title ?? t.chartData}
        columns={[t.chartTime, ...series.map((s) => s.name)]}
        rows={labels.map((l, i) => [l, ...series.map((s) => fmtOrGap(s.values[i]))])}
      />
    </figure>
  );
}

/** The runs of known values (their indices), split where a value is null. */
export function segments(values: ReadonlyArray<number | null>): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(i);
  });
  if (run.length) runs.push(run);
  return runs;
}
