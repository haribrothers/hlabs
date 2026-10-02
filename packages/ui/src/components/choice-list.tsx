import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ChoiceOption<V extends string = string> {
  value: V;
  title: ReactNode;
  subtitle?: ReactNode;
  /** A Lucide icon in a tile on the left. */
  icon?: ReactNode;
  /** A Badge on the right ("Fastest"). */
  trailing?: ReactNode;
  /** Shown but can't be chosen; the subtitle says why. Arrow keys skip it. */
  disabled?: boolean;
}

export interface ChoiceListProps<V extends string> {
  /** Names the group for screen readers: "Storage location". */
  label: string;
  options: ChoiceOption<V>[];
  /** The chosen option's value, or '' before anything is chosen. */
  value: V | '';
  onChange: (value: V) => void;
  className?: string;
}

/**
 * A single-choice list of larger options (a radio group of cards, e.g. where data lives). Arrow keys move and
 * select, Space and Enter select, and only the chosen option is in the tab order.
 */
export function ChoiceList<V extends string>({ label, options, value, onChange, className }: ChoiceListProps<V>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    const n = options.length;
    // The next option that can be chosen, stepping from `from` by `step`.
    const step = (from: number, by: number) => {
      for (let k = 0, j = from; k < n; k++, j = (j + by + n) % n) if (!options[j]!.disabled) return j;
      return -1;
    };
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? step((i + 1) % n, 1)
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? step((i - 1 + n) % n, -1)
          : e.key === 'Home'
            ? step(0, 1)
            : e.key === 'End'
              ? step(n - 1, -1)
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  // With nothing chosen yet, the first option takes the Tab stop.
  const chosen = options.findIndex((o) => o.value === value);
  const tabStop =
    chosen >= 0
      ? chosen
      : Math.max(
          0,
          options.findIndex((o) => !o.disabled),
        );

  return (
    <div role="radiogroup" aria-label={label} className={cn('hl-choices', className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={o.disabled}
            className="hl-choice"
            onClick={() => onChange(o.value)}
          >
            {o.icon ? (
              <span className="hl-choice-icon" aria-hidden="true">
                {o.icon}
              </span>
            ) : null}
            <span className="hl-choice-text">
              <span className="hl-choice-title">{o.title}</span>
              {o.subtitle ? <span className="hl-choice-sub">{o.subtitle}</span> : null}
            </span>
            {o.trailing}
          </button>
        );
      })}
    </div>
  );
}
