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
  /** Separate search circle. Phones pass false (search lives in App Store and Files). */
  search?: boolean;
  onSearch?: () => void;
}

/** The phone tab bar (< 768px): Liquid Glass capsule, a lens that slides to the selected tab. */
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
        <div className="hl-tabbar-glass">
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
                {selected ? (
                  <m.span
                    className="hl-tab-lens"
                    layoutId={reduce ? undefined : 'tab-lens'}
                    transition={motion.spring}
                  />
                ) : null}
                <span className="hl-tab-content">
                  <Glyph />
                  <span>{item.label}</span>
                </span>
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
        </div>
      </LayoutGroup>
      {search ? (
        <button type="button" className="hl-tab hl-tab-search hl-tabbar-glass" aria-label={t.search} onClick={onSearch}>
          <SearchGlyph />
        </button>
      ) : null}
    </nav>
  );
}
