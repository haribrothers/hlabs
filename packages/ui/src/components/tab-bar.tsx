import { tabGlyphs } from '@hlabs/icons';
import { LayoutGroup, motion as m } from 'framer-motion';
import { useId, useState } from 'react';
import { motion, useReduceMotion } from '../lib/motion';
import { useUiStrings } from '../lib/strings';
import { badgeText, type AreaItem } from './areas';

export interface TabBarProps {
  items: AreaItem[];
  active?: string;
  defaultActive?: string;
  onSelect?: (id: string) => void;
  /** Separate search slot. Phones pass false (search lives on Home, in the App Store and in Files, US-PHONE-09). */
  search?: boolean;
  onSearch?: () => void;
}

/**
 * The phone tab bar (< 768px, D-172): docked to the bottom edge, 49px plus the home-indicator inset, one tab per
 * area with its glyph and name. The current tab is in the accent colour with a soft highlight behind its glyph (so
 * it's never colour alone), and `aria-current="page"`; the highlight slides between tabs with `motion.spring`.
 */
export function TabBar({ items, active, defaultActive, onSelect, search = false, onSearch }: TabBarProps) {
  const t = useUiStrings();
  const reduce = useReduceMotion();
  const group = useId();
  const [inner, setInner] = useState(defaultActive ?? items[0]?.id);
  const current = active ?? inner;
  const pick = (id: string) => {
    if (active === undefined) setInner(id);
    onSelect?.(id);
  };
  const SearchGlyph = tabGlyphs.search;

  return (
    <nav aria-label={t.tabBar} className="hl-tabbar">
      <LayoutGroup id={group}>
        {items.map((item) => {
          const Glyph = tabGlyphs[(item.icon ?? item.id) as keyof typeof tabGlyphs] ?? tabGlyphs.home;
          const selected = item.id === current;
          return (
            <button
              key={item.id}
              type="button"
              className="hl-tab"
              aria-current={selected ? 'page' : undefined}
              onClick={() => pick(item.id)}
            >
              <span className="hl-tab-glyph">
                {selected ? (
                  <m.span
                    aria-hidden
                    className="hl-tab-lens"
                    layoutId={reduce ? undefined : 'tab-lens'}
                    transition={motion.spring}
                  />
                ) : null}
                <Glyph />
              </span>
              <span className="hl-tab-label">{item.label}</span>
              {item.badge ? (
                <span
                  className="hl-count"
                  aria-label={item.id === 'store' ? t.badgeUpdates(item.badge) : t.badgeNew(item.badge)}
                >
                  {badgeText(item.badge)}
                </span>
              ) : null}
            </button>
          );
        })}
      </LayoutGroup>
      {search ? (
        <button type="button" className="hl-tab" aria-label={t.search} onClick={onSearch}>
          <span className="hl-tab-glyph">
            <SearchGlyph />
          </span>
        </button>
      ) : null}
    </nav>
  );
}
