import { LogoMark, Plus, tabGlyphs } from '@hlabs/icons';
import { useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useReduceMotion } from '../lib/motion';
import { useUiStrings } from '../lib/strings';
import type { AreaItem } from './areas';

export interface DockApp {
  id: string;
  name: string;
  /** App logo URL (manifest); falls back to the gradient tile. */
  logo?: string | null;
  colors?: readonly [string, string];
  /** White icon on the gradient fallback. */
  icon?: ReactNode;
  /** Has an open window: shows the dot. */
  open?: boolean;
  badge?: number;
}

export interface DockProps {
  /** Home, App Store, Files, Usage, Backups, Settings; members get fewer (D-054). */
  areas: AreaItem[];
  active?: string;
  onSelect?: (id: string) => void;
  /** Counts by area id, e.g. { store: 2 }. */
  badges?: Record<string, number>;
  /** The person's pinned apps, in order (up to 8). */
  apps?: DockApp[];
  onOpenApp?: (id: string) => void;
  /** Right-click or long-press on a pinned app. */
  onAppMenu?: (id: string, e: MouseEvent | PointerEvent) => void;
  /** Shows the dashed + tile. */
  onAdd?: () => void;
  onSearch?: () => void;
  /** Default true. */
  search?: boolean;
  /** Hover magnification. Default true; always off with Reduce motion. */
  magnify?: boolean;
}

const LONG_PRESS_MS = 500;
const GLYPH_SIZE = 28;
const HOME_MARK_SIZE = 27;
const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

interface ItemProps {
  label: string;
  ariaLabel?: string;
  tileClass?: string;
  className?: string;
  current?: boolean;
  dot?: boolean;
  badge?: number;
  tileStyle?: React.CSSProperties;
  onClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  onLongPress?: (e: PointerEvent) => void;
  children: ReactNode;
}

function DockItem({
  label,
  ariaLabel,
  tileClass,
  className,
  current,
  dot,
  badge,
  tileStyle,
  onClick,
  onContextMenu,
  onLongPress,
  children,
}: ItemProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!onLongPress || e.pointerType === 'mouse') return;
    fired.current = false;
    e.persist?.();
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress(e);
    }, LONG_PRESS_MS);
  };
  return (
    <button
      type="button"
      data-dock=""
      className={cn('hl-dock-item', className)}
      aria-label={ariaLabel ?? label}
      aria-current={current ? 'page' : undefined}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onClick?.();
      }}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
    >
      <span className={cn('hl-dock-tile', tileClass)} style={tileStyle}>
        {children}
        {badge ? (
          <span className="hl-dock-badge" aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="hl-dock-tip" aria-hidden="true">
        {label}
      </span>
      {dot ? <span className="hl-dock-dot" /> : null}
    </button>
  );
}

/** Desktop and web navigation (≥ 768px), in the spirit of the macOS Dock (D-054). */
export function Dock({
  areas,
  active,
  onSelect,
  badges = {},
  apps = [],
  onOpenApp,
  onAppMenu,
  onAdd,
  onSearch,
  search = true,
  magnify = true,
}: DockProps) {
  const t = useUiStrings();
  const reduce = useReduceMotion();
  const SearchGlyph = tabGlyphs.search;

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!NAV_KEYS.has(e.key)) return;
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-dock]'));
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : items.length - 1;
    items[(n + items.length) % items.length]?.focus();
    e.preventDefault();
  };

  return (
    <nav aria-label={t.dock} className={cn('hl-dock', (!magnify || reduce) && 'hl-dock-still')} onKeyDown={onKeyDown}>
      {areas.map((area) => {
        const badge = badges[area.id] ?? area.badge;
        const Glyph = tabGlyphs[(area.icon ?? area.id) as keyof typeof tabGlyphs] ?? tabGlyphs.home;
        const suffix = badge ? `, ${area.id === 'store' ? t.badgeUpdates(badge) : t.badgeNew(badge)}` : '';
        return (
          <DockItem
            key={area.id}
            label={area.label}
            ariaLabel={area.label + suffix}
            tileClass={`hl-dock-tile-${area.id}`}
            current={area.id === active}
            dot={area.id === active}
            badge={badge}
            onClick={() => onSelect?.(area.id)}
          >
            {area.id === 'home' ? (
              <LogoMark size={HOME_MARK_SIZE} tone="white" title="" simplified={false} />
            ) : (
              <Glyph size={GLYPH_SIZE} />
            )}
          </DockItem>
        );
      })}
      <span className="hl-dock-sep" aria-hidden="true" />
      {apps.map((app) => (
        <DockItem
          key={`app-${app.id}`}
          label={app.name}
          ariaLabel={app.name + (app.open ? `, ${t.open}` : '')}
          className="hl-dock-item-app"
          tileClass="hl-dock-tile-app"
          tileStyle={{
            background: app.logo
              ? 'var(--fill-primary)'
              : `linear-gradient(160deg, ${app.colors?.[0] ?? 'var(--accent-strong)'}, ${app.colors?.[1] ?? 'var(--wall-base)'})`,
          }}
          dot={app.open}
          badge={app.badge}
          onClick={() => onOpenApp?.(app.id)}
          onContextMenu={
            onAppMenu
              ? (e) => {
                  e.preventDefault();
                  onAppMenu(app.id, e);
                }
              : undefined
          }
          onLongPress={onAppMenu ? (e) => onAppMenu(app.id, e) : undefined}
        >
          {app.logo ? <img src={app.logo} alt="" className="hl-dock-logo" /> : app.icon}
        </DockItem>
      ))}
      {onAdd ? (
        <DockItem label={t.addToDock} className="hl-dock-add" onClick={onAdd}>
          <Plus size={22} strokeWidth={2} aria-hidden="true" />
        </DockItem>
      ) : null}
      {search ? (
        <>
          <span className="hl-dock-sep" aria-hidden="true" />
          <DockItem label={t.search} className="hl-dock-glassitem" onClick={onSearch}>
            <SearchGlyph size={26} />
          </DockItem>
        </>
      ) : null}
    </nav>
  );
}
