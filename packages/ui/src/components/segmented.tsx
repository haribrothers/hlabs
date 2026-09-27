import { motion as m } from 'framer-motion';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion, useReduceMotion } from '../lib/motion';

export interface SegmentedProps {
  options: { value: string; label: ReactNode }[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  'aria-label'?: string;
}

/** Two to five mutually exclusive options that apply at once (a radio group). */
export function Segmented({ options, value, defaultValue, onChange, ...aria }: SegmentedProps) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value);
  const current = value ?? inner;
  const reduce = useReduceMotion();
  const layoutId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === current);
    const last = options.length - 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % options.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i - 1 + options.length) % options.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    e.preventDefault();
    select(options[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={aria['aria-label']} className="hl-seg" onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const checked = o.value === current;
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
            className="hl-seg-opt"
            onClick={() => select(o.value)}
          >
            {checked ? (
              <m.span
                className="hl-seg-thumb"
                layoutId={reduce ? undefined : `seg-${layoutId}`}
                transition={motion.spring}
              />
            ) : null}
            <span className="hl-seg-text">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
