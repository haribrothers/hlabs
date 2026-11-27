// A tile's menu on a phone (US-PHONE-08, D-172; PhoneRedesignA_TileMenu): after a 500 ms long press the tile lifts
// over a blurred, dimmed Home with its menu beside it: the app and its state, then Open, Settings, Logs, Restart (Start
// when stopped) and, apart, Uninstall…. Members get Open. Up and Down move between the items, Escape or a tap outside
// closes it and focus goes back to the tile. On a tablet (TabletMenu, US-TAB-02) the same layer holds the desktop's
// items, with the menu at the tile's side and the tile's name under it.
import {
  AppLogo,
  appTileLook,
  ExternalLink,
  iconDefaults,
  Play,
  RotateCcw,
  ScrollText,
  Settings,
  Trash2,
  Wrench,
} from '@hlabs/icons';
import { PhoneMenuLayer, tokens } from '@hlabs/ui';
import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { appsCopy } from '../copy/apps';
import { homeCopy } from '../copy/home';
import type { HomeApp } from './home-app';

const copy = homeCopy.phoneMenu;
/** The lifted tile: a little larger than the tile it came from (60px on a phone, 76px on a tablet). */
const LIFTED = tokens.SIZE_APP_ICON_PHONE + tokens.SPACE_1;
const LIFTED_TOUCH = tokens.SIZE_APP_ICON + tokens.SPACE_1;
/** The menu's width and its distance from the screen's edges and from the tile. */
const MENU_WIDTH = tokens.SIZE_APP_ICON * 3 + tokens.SPACE_7;
const EDGE = tokens.SPACE_4;
const GAP = tokens.SPACE_4;

export interface PhoneMenuItem {
  id: string;
  label: string;
  glyph: typeof ExternalLink;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** In a group of its own at the end, after a gap (Edit Home on a tablet). */
  apart?: boolean;
}

/** The items for an app in a state, for an admin or a member (the story's list: Open, Settings, Logs, Restart, Uninstall…). */
export function phoneMenuItems(
  app: HomeApp,
  isAdmin: boolean,
  moving: boolean,
  act: {
    open: () => void;
    settings: () => void;
    logs: () => void;
    command: (c: 'start' | 'restart') => void;
    reinstall: () => void;
    uninstall: () => void;
  },
): PhoneMenuItem[] {
  const items: PhoneMenuItem[] = [
    { id: 'open', label: copy.open, glyph: ExternalLink, onSelect: act.open, disabled: isAdmin && moving },
  ];
  if (!isAdmin) return items;
  if (moving) return [...items, { id: 'logs', label: copy.logs, glyph: ScrollText, onSelect: act.logs }];
  if (app.state !== 'install_failed')
    items.push({ id: 'settings', label: copy.settings, glyph: Settings, onSelect: act.settings });
  items.push({ id: 'logs', label: copy.logs, glyph: ScrollText, onSelect: act.logs });
  if (app.state === 'running' || app.state === 'error')
    items.push({ id: 'restart', label: copy.restart, glyph: RotateCcw, onSelect: () => act.command('restart') });
  if (app.state === 'error')
    items.push({ id: 'reinstall', label: copy.reinstall, glyph: Wrench, onSelect: act.reinstall });
  if (app.state === 'stopped')
    items.push({ id: 'start', label: copy.start, glyph: Play, onSelect: () => act.command('start') });
  items.push({ id: 'uninstall', label: copy.uninstall, glyph: Trash2, onSelect: act.uninstall, danger: true });
  return items;
}

interface Place {
  tile: { left: number; top: number };
  menu: { left: number; top?: number; bottom?: number };
}

/** The lifted tile where the tile is, and the menu under it (above it when there's no room), inside the screen. */
function place(icon: DOMRect, menuHeight: number): Place {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tile = { left: icon.left + (icon.width - LIFTED) / 2, top: icon.top + (icon.height - LIFTED) / 2 };
  const left = Math.max(EDGE, Math.min(icon.left, vw - EDGE - MENU_WIDTH));
  const below = tile.top + LIFTED + GAP;
  if (below + menuHeight <= vh - EDGE) return { tile, menu: { left, top: below } };
  return { tile, menu: { left, bottom: vh - tile.top + GAP } };
}

/** On a tablet: the menu at the tile's right (its left when there's no room), level with it, inside the screen. */
function placeBeside(icon: DOMRect, menuWidth: number, menuHeight: number): Place {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tile = {
    left: icon.left + (icon.width - LIFTED_TOUCH) / 2,
    top: icon.top + (icon.height - LIFTED_TOUCH) / 2,
  };
  const right = tile.left + LIFTED_TOUCH + GAP;
  const left = right + menuWidth <= vw - EDGE ? right : Math.max(EDGE, tile.left - GAP - menuWidth);
  const middle = tile.top + LIFTED_TOUCH / 2 - menuHeight / 2;
  const top = Math.max(EDGE, Math.min(middle, vh - EDGE - menuHeight));
  return { tile, menu: { left, top } };
}

export function PhoneTileMenu({
  app,
  open,
  onOpenChange,
  anchor,
  items,
  beside = false,
  children,
}: {
  /** A tablet's menu (TabletMenu): wider, at the tile's side, with the tile's name under the lifted tile. */
  beside?: boolean;
  app: HomeApp;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tile's icon: where the lifted tile goes. */
  anchor: () => HTMLElement | null;
  items: PhoneMenuItem[];
  /** Dialogs the items open (Uninstall…), kept mounted with the menu. */
  children?: ReactNode;
}) {
  const labelId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const tile = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef(anchor);
  useLayoutEffect(() => {
    anchorRef.current = anchor;
  });
  // Placed once the menu is on the page, from the tile and the menu's own height (written to the DOM, not state).
  const placeMenu = (node: HTMLDivElement | null) => {
    menu.current = node;
    const icon = anchorRef.current();
    if (!node || !icon || !tile.current) return;
    const at = beside
      ? placeBeside(icon.getBoundingClientRect(), node.offsetWidth, node.offsetHeight)
      : place(icon.getBoundingClientRect(), node.offsetHeight);
    Object.assign(tile.current.style, { left: `${at.tile.left}px`, top: `${at.tile.top}px`, visibility: 'visible' });
    Object.assign(node.style, {
      left: `${at.menu.left}px`,
      top: at.menu.top === undefined ? '' : `${at.menu.top}px`,
      bottom: at.menu.bottom === undefined ? '' : `${at.menu.bottom}px`,
      visibility: 'visible',
    });
  };
  const lifted = beside ? LIFTED_TOUCH : LIFTED;
  const look = appTileLook(app.name, app.icon, lifted);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    const now = all.indexOf(document.activeElement as HTMLButtonElement);
    // From the menu itself (as it opens), Down goes to the first item and Up to the last.
    const next =
      now < 0
        ? all[e.key === 'ArrowDown' ? 0 : all.length - 1]
        : all[(now + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length];
    next?.focus();
  };
  const logo = (
    <AppLogo
      decorative
      name={app.name}
      src={app.icon.logoUrl}
      colors={look.colors}
      fallbackIcon={look.fallbackIcon}
      size={lifted}
    />
  );
  const plain = items.filter((i) => !i.danger && !i.apart);
  const danger = items.filter((i) => i.danger);
  const apart = items.filter((i) => i.apart && !i.danger);
  const row = (item: PhoneMenuItem) => {
    const Glyph = item.glyph;
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        className={`hl-p-menu-item hl-focus ${item.danger ? 'hl-p-row-danger' : ''}`}
        onClick={() => {
          onOpenChange(false);
          item.onSelect();
        }}
      >
        <span className="flex-1">{item.label}</span>
        <Glyph aria-hidden {...iconDefaults} />
      </button>
    );
  };
  return (
    <>
      <PhoneMenuLayer
        open={open}
        onOpenChange={onOpenChange}
        label={app.name}
        onOpenAutoFocus={(e) => {
          // Focus on the menu, not its first item: a long-press shouldn't leave a focus ring on Open; the arrow keys
          // move into the items, and screen readers hear the menu's name.
          e.preventDefault();
          menu.current?.focus();
        }}
      >
        {beside ? (
          <span aria-hidden className="hl-t-menu-tile" ref={tile} style={{ visibility: 'hidden' }}>
            <span className="hl-t-menu-logo">{logo}</span>
            <span className="hl-t-menu-name">{app.name}</span>
          </span>
        ) : (
          <span aria-hidden className="hl-p-menu-tile" ref={tile} style={{ visibility: 'hidden' }}>
            {logo}
          </span>
        )}
        <div
          ref={placeMenu}
          role="menu"
          aria-labelledby={labelId}
          tabIndex={-1}
          className="hl-p-menu hl-anim-menu outline-none"
          style={{ visibility: 'hidden', width: beside ? tokens.SIZE_MENU_TOUCH : MENU_WIDTH }}
          onKeyDown={onKeyDown}
        >
          <p id={labelId} className="hl-p-menu-head">
            {app.name} ·{' '}
            <span
              className={
                app.state === 'running'
                  ? 'text-success'
                  : app.state === 'error' || app.state === 'install_failed'
                    ? 'text-danger'
                    : 'text-ink-muted'
              }
            >
              {appsCopy.status[app.state]}
            </span>
          </p>
          {plain.map(row)}
          {danger.length ? (
            <>
              <span aria-hidden className="hl-p-menu-gap" />
              {danger.map(row)}
            </>
          ) : null}
          {apart.length ? (
            <>
              <span aria-hidden className="hl-p-menu-gap" />
              {apart.map(row)}
            </>
          ) : null}
        </div>
      </PhoneMenuLayer>
      {children}
    </>
  );
}
