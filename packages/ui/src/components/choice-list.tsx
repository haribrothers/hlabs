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
}

export interface ChoiceListProps<V extends string> {
  /** Names the group for screen readers: "Storage location". */
  label: string;
  options: ChoiceOption<V>[];
  value: V;
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
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? (i + 1) % options.length
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? (i - 1 + options.length) % options.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? options.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

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
            tabIndex={checked ? 0 : -1}
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
