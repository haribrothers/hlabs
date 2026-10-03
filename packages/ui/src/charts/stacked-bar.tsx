import { useState } from 'react';
import { useUiStrings } from '../lib/strings';
import { formatNumber, seriesColor } from './shared';

export interface StackedBarProps {
  /** Used parts in chart order (apps, files, system); the rest of total shows as Free. */
  segments: { label: string; value: number }[];
  total?: number;
  title?: string;
  unit?: string;
  formatValue?: (v: number) => string;
}

/** One bar that splits a total into parts, with a legend of values under it. */
export function StackedBar({ segments, total, title, unit, formatValue }: StackedBarProps) {
  const t = useUiStrings();
  const [idx, setIdx] = useState<number | null>(null);
  const fmt = formatValue ?? ((v: number) => formatNumber(v) + (unit ? ` ${unit}` : ''));
  const used = segments.reduce((a, s) => a + s.value, 0);
  const sum = total ?? used;
  const free = Math.max(0, sum - used);
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
        aria-label={[...segments.map((s) => `${s.label} ${fmt(s.value)}`), `${t.free.toLowerCase()} ${fmt(free)}`].join(
          ', ',
        )}
      >
        {/* An empty part has no sliver in the bar; the legend still names it. */}
        {segments.map((s, i) =>
          s.value > 0 ? (
            <span
              key={s.label}
              className="hl-stack-seg"
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
        <span className="hl-stack-free" />
      </div>
      <div className="hl-chart-legend">
        {segments.map((s, i) => (
          <span key={s.label} className="hl-chart-key">
            <span className="hl-chart-swatch" style={{ background: seriesColor(i) }} />
            {s.label}
            <b>{fmt(s.value)}</b>
          </span>
        ))}
        <span className="hl-chart-key">
          <span className="hl-chart-swatch" style={{ background: 'var(--surface-control)' }} />
          {t.free}
          <b>{fmt(free)}</b>
        </span>
      </div>
    </figure>
  );
}
