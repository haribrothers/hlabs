import { motion as m } from 'framer-motion';
import { useId, useRef, type KeyboardEvent } from 'react';
import { motion, useReduceMotion } from '../lib/motion';

export interface SectionTabsProps {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
  'aria-label': string;
}

/** Sections of one view (App settings' Overview, Configuration…): tabs in the Segmented pill, arrow keys move. */
export function SectionTabs({ tabs, active, onSelect, ...aria }: SectionTabsProps) {
  const reduce = useReduceMotion();
  const layoutId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(tabs[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={aria['aria-label']} className="hl-seg self-start" onKeyDown={onKeyDown}>
      {tabs.map((tab, i) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className="hl-seg-opt"
            onClick={() => onSelect(tab.id)}
          >
            {selected ? (
              <m.span
                className="hl-seg-thumb"
                layoutId={reduce ? undefined : `tabs-${layoutId}`}
                transition={motion.spring}
              />
            ) : null}
            <span className="hl-seg-text">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
