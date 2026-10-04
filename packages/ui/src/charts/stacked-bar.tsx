import { useId, useState, type KeyboardEvent } from 'react';
import { useUiStrings } from '../lib/strings';
import { Announce, formatNumber, seriesColor, SrTable, stepKey, Swatch } from './shared';

export interface StackedBarProps {
  /** Used parts in chart order (apps, files, system); the rest of total shows as Free. */
  segments: { label: string; value: number }[];
  total?: number;
  title?: string;
  unit?: string;
  formatValue?: (v: number) => string;
  /** False inside a link or button (a Home widget): not focusable, no keys, no table; its label says it all. */
  interactive?: boolean;
}

/**
 * One bar that splits a total into parts, with a legend of values under it. Left/Right (Home/End) step through the
 * parts, each announced; a hidden table linked with aria-describedby; in forced colours each part has its own pattern.
 */
export function StackedBar({ segments, total, title, unit, formatValue, interactive = true }: StackedBarProps) {
  const t = useUiStrings();
  const tableId = useId();
  const [idx, setIdx] = useState<number | null>(null);
  const fmt = formatValue ?? ((v: number) => formatNumber(v) + (unit ? ` ${unit}` : ''));
  const used = segments.reduce((a, s) => a + s.value, 0);
  const sum = total ?? used;
  const free = Math.max(0, sum - used);
  const parts = [...segments, { label: t.free, value: free }];
  const current = idx === null ? null : parts[idx];
  const described = parts.map((s) => `${s.label} ${fmt(s.value)}`).join(', ');
  return (
    <figure className="hl-chart">
      {title ? (
        <figcaption className="hl-chart-title">
          {title}
          <span className="hl-chart-sub">{t.of(fmt(used), fmt(sum))}</span>
        </figcaption>
      ) : null}
      <div
        className="hl-stack"
        role="img"
        {...(interactive
          ? {
              tabIndex: 0,
              'aria-label': `${title ?? t.chartData}. ${described}. ${t.chartHint}`,
              'aria-describedby': tableId,
              onKeyDown: (e: KeyboardEvent) => stepKey(e, parts.length, idx, setIdx),
              onBlur: () => setIdx(null),
            }
          : { 'aria-label': title ? `${title}. ${described}` : described })}
      >
        {/* An empty part has no sliver in the bar; the legend still names it. */}
        {segments.map((s, i) =>
          s.value > 0 ? (
            <span
              key={s.label}
              className="hl-stack-seg"
              data-series={i}
              style={{
                flexBasis: `${sum > 0 ? (s.value / sum) * 100 : 0}%`,
                background: seriesColor(i),
                opacity: idx === null || idx === i ? 1 : 0.55,
              }}
              onMouseEnter={() => setIdx(i)}
              onMouseLeave={() => setIdx(null)}
            />
          ) : null,
        )}
        <span
          className="hl-stack-free"
          style={{ opacity: idx === null || idx === segments.length ? 1 : 0.55 }}
          onMouseEnter={() => setIdx(segments.length)}
          onMouseLeave={() => setIdx(null)}
        />
      </div>
      <div className="hl-chart-legend">
        {segments.map((s, i) => (
          <span key={s.label} className="hl-chart-key" data-focused={idx === i ? true : undefined}>
            <Swatch index={i} />
            {s.label}
            <b>{fmt(s.value)}</b>
          </span>
        ))}
        <span className="hl-chart-key" data-focused={idx === segments.length ? true : undefined}>
          <span className="hl-chart-swatch hl-chart-swatch-free" />
          {t.free}
          <b>{fmt(free)}</b>
        </span>
      </div>
      {interactive ? (
        <>
          <Announce text={current ? `${current.label} ${fmt(current.value)}` : ''} />
          <SrTable
            id={tableId}
            caption={title ?? t.chartData}
            columns={[t.chartPart, t.value]}
            rows={parts.map((p) => [p.label, fmt(p.value)])}
          />
        </>
      ) : null}
    </figure>
  );
}
