import { LOGO_SCALE, LogoMark, Plus, tabGlyphs } from '@hlabs/icons';
import {
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';
import { useReduceMotion } from '../lib/motion';
import { useUiStrings } from '../lib/strings';
import { badgeText, type AreaItem } from './areas';

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
  /** Pinned by the person (US-HOME-22): can be moved and has a menu. Open-only apps come after the pinned ones. */
  pinned?: boolean;
}

/** What a drag from Home carries: the app's id (US-HOME-22). */
export const DOCK_DRAG_TYPE = 'application/x-hlabs-app';

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
  /** Right-click, long-press, Shift+F10 or the Menu key on a pinned app; `anchor` is its tile. */
  onAppMenu?: (id: string, anchor: HTMLElement) => void;
  /** Shows the dashed + tile; `anchor` is the tile. */
  onAdd?: (anchor: HTMLElement) => void;
  /** A pinned app moved to `index` among the pinned apps (dragged sideways, or Alt+Left/Right). */
  onMoveApp?: (id: string, index: number) => void;
  /** An app dragged from Home dropped at `index` among the pinned apps. */
  onDropApp?: (id: string, index: number) => void;
  /** False when the Dock is full: a drag from Home opens no gap and drops nothing. Default true. */
  canDrop?: boolean;
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
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (e: MouseEvent<HTMLButtonElement>) => void;
  onLongPress?: (tile: HTMLButtonElement) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  dataApp?: string;
  pinned?: boolean;
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
  onKeyDown,
  draggable,
  onDragStart,
  onDragEnd,
  dataApp,
  pinned,
  children,
}: ItemProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!onLongPress || e.pointerType === 'mouse') return;
    fired.current = false;
    // The event's target is gone by the time the timer fires: keep the tile.
    const tile = e.currentTarget;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress(tile);
    }, LONG_PRESS_MS);
  };
  return (
    <button
      type="button"
      data-dock=""
      data-dock-app={dataApp}
      data-pinned={pinned ? '' : undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      className={cn('hl-dock-item', className)}
      aria-label={ariaLabel ?? label}
      aria-current={current ? 'page' : undefined}
      onClick={(e) => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onClick?.(e);
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
            {badgeText(badge)}
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
  onMoveApp,
  onDropApp,
  canDrop = true,
  onSearch,
  search = true,
  magnify = true,
}: DockProps) {
  const t = useUiStrings();
  const reduce = useReduceMotion();
  const SearchGlyph = tabGlyphs.search;
  const pinned = apps.filter((a) => a.pinned);
  const unpinned = apps.filter((a) => !a.pinned);
  /** Where a dragged app would land among the pinned apps, while one is over the Dock. */
  const [gap, setGap] = useState<number | null>(null);
  const dragging = useRef<string | null>(null);

  /** The pinned app a pointer at `x` would go before. */
  const indexAt = (nav: HTMLElement, x: number) => {
    const tiles = Array.from(nav.querySelectorAll<HTMLElement>('[data-dock-app][data-pinned]')).filter(
      (el) => el.dataset.dockApp !== dragging.current,
    );
    const i = tiles.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return x < r.left + r.width / 2;
    });
    return i < 0 ? tiles.length : i;
  };
  const accepts = (e: DragEvent) =>
    e.dataTransfer.types.includes(DOCK_DRAG_TYPE) && (dragging.current !== null || (canDrop && Boolean(onDropApp)));
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragging.current ? 'move' : 'copy';
    setGap(indexAt(e.currentTarget, e.clientX));
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    if (!accepts(e)) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(DOCK_DRAG_TYPE);
    const at = indexAt(e.currentTarget, e.clientX);
    setGap(null);
    if (!id) return;
    if (dragging.current) onMoveApp?.(id, at);
    else onDropApp?.(id, at);
    dragging.current = null;
  };
  const gapTile = <span key="gap" className="hl-dock-gap" aria-hidden="true" />;

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
    <nav
      aria-label={t.dock}
      className={cn('hl-dock', (!magnify || reduce) && 'hl-dock-still')}
      onKeyDown={onKeyDown}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGap(null);
      }}
      onDrop={onDrop}
    >
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
      {apps.length > 0 || onAdd ? <span className="hl-dock-sep" aria-hidden="true" /> : null}
      {[...pinned, ...unpinned].flatMap((app, i) => [
        ...(gap !== null && i === gap ? [gapTile] : []),
        <DockItem
          key={`app-${app.id}`}
          dataApp={app.id}
          pinned={app.pinned}
          label={app.name}
          ariaLabel={app.name + (app.open ? `, ${t.open}` : '')}
          className="hl-dock-item-app"
          tileClass="hl-dock-tile-app"
          tileStyle={{
            // The same tile as on Home: the app's gradient, with its logo inset on it.
            background: `linear-gradient(160deg, ${app.colors?.[0] ?? 'var(--accent-strong)'}, ${app.colors?.[1] ?? 'var(--wall-base)'})`,
          }}
          dot={app.open}
          badge={app.badge}
          onClick={() => onOpenApp?.(app.id)}
          onContextMenu={
            onAppMenu && app.pinned
              ? (e) => {
                  e.preventDefault();
                  onAppMenu(app.id, e.currentTarget);
                }
              : undefined
          }
          onLongPress={onAppMenu && app.pinned ? (tile) => onAppMenu(app.id, tile) : undefined}
          onKeyDown={(e) => {
            if (!app.pinned) return;
            // Shift+F10 or the Menu key: its menu. Alt+Left/Right: move it (US-HOME-22).
            if (onAppMenu && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) {
              e.preventDefault();
              e.stopPropagation();
              onAppMenu(app.id, e.currentTarget);
            } else if (onMoveApp && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
              e.preventDefault();
              e.stopPropagation();
              const at = pinned.findIndex((p) => p.id === app.id) + (e.key === 'ArrowLeft' ? -1 : 1);
              if (at >= 0 && at < pinned.length) onMoveApp(app.id, at);
            }
          }}
          draggable={Boolean(app.pinned && onMoveApp)}
          onDragStart={(e) => {
            dragging.current = app.id;
            e.dataTransfer.setData(DOCK_DRAG_TYPE, app.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            dragging.current = null;
            setGap(null);
          }}
        >
          {app.logo ? (
            <img
              src={app.logo}
              alt=""
              className="hl-dock-logo"
              style={{ width: `${LOGO_SCALE * 100}%`, height: `${LOGO_SCALE * 100}%` }}
            />
          ) : (
            app.icon
          )}
        </DockItem>,
      ])}
      {gap !== null && gap >= pinned.length && unpinned.length === 0 ? gapTile : null}
      {onAdd ? (
        <DockItem label={t.addToDock} className="hl-dock-add" onClick={(e) => onAdd(e.currentTarget)}>
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
