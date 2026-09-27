// Chart helpers (09-design-system rule 5): chart-1…chart-6 in fixed order, hairline grid,
// legends for ≥ 2 series, tooltips, arrow-key stepping and a hidden data table.

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

export function SrTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: string[][] }) {
  return (
    <table className="hl-sr">
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

export function Legend({ items, line }: { items: { name: string; color: string }[]; line?: boolean }) {
  return (
    <div className="hl-chart-legend">
      {items.map((it) => (
        <span key={it.name} className="hl-chart-key">
          <span
            className={line ? 'hl-chart-swatch hl-chart-swatch-line' : 'hl-chart-swatch'}
            style={{ background: it.color }}
          />
          {it.name}
        </span>
      ))}
    </div>
  );
}
