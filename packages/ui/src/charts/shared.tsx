// Chart helpers (09-design-system rule 5, US-USE-05): chart-1…chart-6 in fixed order, hairline grid, legends for ≥ 2
// series, tooltips, arrow-key stepping (announced), a hidden data table linked with aria-describedby, at most 200 points
// to step through when there are more than 500, and line styles or patterns per series in forced-colours mode.
import type { KeyboardEvent } from 'react';

export const SERIES_LIMIT = 6;
export const seriesColor = (i: number) => `var(--chart-${Math.min(i, SERIES_LIMIT - 1) + 1})`;

/** A clean axis maximum above the data: 1, 2, 2.5, 5 or 10 × 10^n. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function formatNumber(v: number): string {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return (Math.round(v * 10) / 10).toLocaleString('en-US');
}

/** Which x labels to draw so they never crowd: every `every`-th plus the last. */
export const showLabel = (i: number, n: number, every: number) =>
  i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.6);

/** More points than this are downsampled… */
export const DOWNSAMPLE_OVER = 500;
/** …to at most this many, so stepping with the keyboard stays usable (US-USE-05). */
export const DOWNSAMPLE_TO = 200;

/**
 * Which points to keep: all of them up to 500; otherwise at most 200 buckets, each kept by its highest total so peaks
 * survive. The chart, its keyboard stepping and its hidden table all use the same set.
 */
export function downsample(n: number, series: { values: number[] }[]): number[] {
  const all = Array.from({ length: n }, (_, i) => i);
  if (n <= DOWNSAMPLE_OVER) return all;
  const size = n / DOWNSAMPLE_TO;
  const keep: number[] = [];
  for (let b = 0; b < DOWNSAMPLE_TO; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(n, Math.floor((b + 1) * size));
    let best = from;
    let bestTotal = -Infinity;
    for (let i = from; i < to; i++) {
      const total = series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0);
      if (total > bestTotal) [best, bestTotal] = [i, total];
    }
    keep.push(best);
  }
  return keep;
}

/** Left/Right one step, Home/End the first and last, Escape leaves; true when the key was a chart key. */
export function stepKey(e: KeyboardEvent, n: number, idx: number | null, set: (i: number | null) => void): boolean {
  if (n === 0) return false;
  if (e.key === 'ArrowRight') set(idx === null ? 0 : Math.min(n - 1, idx + 1));
  else if (e.key === 'ArrowLeft') set(idx === null ? n - 1 : Math.max(0, idx - 1));
  else if (e.key === 'Home') set(0);
  else if (e.key === 'End') set(n - 1);
  else if (e.key === 'Escape') set(null);
  else return false;
  e.preventDefault();
  return true;
}

/** What a screen reader hears for a point: "16:32, CPU 46%" (several series: "16:32, In 2 MB/s, Out 1 MB/s"). */
export const pointText = (label: string, values: Array<{ name: string; value: string }>) =>
  [label, ...values.map((v) => `${v.name} ${v.value}`)].join(', ');

/** Announces the focused point politely; the visible tooltip is for sighted people and stays out of the way. */
export function Announce({ text }: { text: string }) {
  return (
    <span className="hl-sr" role="status" aria-live="polite">
      {text}
    </span>
  );
}

/** Forced-colours line styles in series order: solid, dashed, dotted, dash-dot, long dash, sparse dots. */
export const DASHES = ['none', '8 4', '2 3', '8 3 2 3', '14 5', '1 6'];
export const seriesDash = (i: number) => DASHES[Math.min(i, SERIES_LIMIT - 1)]!;

/** Forced-colours fills in series order (solid, diagonal, cross-hatch, dots, horizontal, vertical), one set per chart. */
export function PatternDefs({ id }: { id: string }) {
  const stroke = { stroke: 'CanvasText', strokeWidth: 1.5 };
  const shapes = [
    <rect key="solid" width="6" height="6" style={{ fill: 'CanvasText' }} />,
    <path key="diag" d="M-1 7 L7 -1" style={stroke} />,
    <path key="cross" d="M-1 7 L7 -1 M-1 -1 L7 7" style={stroke} />,
    <circle key="dots" cx="3" cy="3" r="1.3" style={{ fill: 'CanvasText' }} />,
    <path key="h" d="M0 3 H6" style={stroke} />,
    <path key="v" d="M3 0 V6" style={stroke} />,
  ];
  return (
    <defs>
      {shapes.map((shape, i) => (
        <pattern key={i} id={`${id}-p${i}`} width="6" height="6" patternUnits="userSpaceOnUse">
          {shape}
        </pattern>
      ))}
    </defs>
  );
}
export const patternFill = (id: string, i: number) => `url(#${id}-p${Math.min(i, SERIES_LIMIT - 1)})`;

export function SrTable({
  id,
  caption,
  columns,
  rows,
}: {
  id?: string;
  caption: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <table className="hl-sr" id={id}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th key={i} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {c}
                </th>
              ) : (
                <td key={j}>{c}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A series' key: its colour, and in forced colours its line style or fill pattern (data-series, components.css). */
export function Swatch({ index, line = false }: { index: number; line?: boolean }) {
  return (
    <span
      className={line ? 'hl-chart-swatch hl-chart-swatch-line' : 'hl-chart-swatch'}
      data-series={Math.min(index, SERIES_LIMIT - 1)}
      style={{ background: seriesColor(index) }}
    />
  );
}

export function Legend({ names, line }: { names: string[]; line?: boolean }) {
  return (
    <div className="hl-chart-legend">
      {names.map((name, i) => (
        <span key={name} className="hl-chart-key">
          <Swatch index={i} line={line} />
          {name}
        </span>
      ))}
    </div>
  );
}
