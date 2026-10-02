// A tile's menu (US-HOME-07): right-click, Shift+F10 or the Menu key, or a 500 ms long press on touch. Admins get
// Open, Settings, View logs, Restart and Stop (Start when stopped) and Uninstall…; while an app is on its way
// somewhere only View logs; members only Open. Esc or a click outside closes it and focus goes back to the tile.
import {
  ExternalLink,
  iconDefaults,
  Play,
  RotateCw,
  SlidersHorizontal,
  Square,
  TextAlignStart,
  Trash2,
} from '@hlabs/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { UninstallDialog } from '../apps/uninstall-dialog';
import { homeCopy } from '../copy/home';
import { useTRPC } from '../lib/trpc';
import type { HomeApp } from './home-app';

const copy = homeCopy.menu;
/** How long a finger rests on a tile before its menu opens. */
export const LONG_PRESS_MS = 500;
/** A finger that moves this far is scrolling, not pressing. */
const MOVE_PX = 10;

export type TileCommand = 'start' | 'stop' | 'restart';

/** States on the way somewhere: nothing to do but watch the logs. */
const MOVING = new Set<HomeApp['state']>([
  'installing',
  'updating',
  'uninstalling',
  'starting',
  'restarting',
  'stopping',
  'rolling_back',
]);

const icon = (Glyph: typeof ExternalLink) => <Glyph {...iconDefaults} className="size-4" />;

export function TileMenu({
  app,
  isAdmin,
  onOpen,
  onCommand,
  disabled = false,
  children,
}: {
  app: HomeApp;
  isAdmin: boolean;
  /** No menu while the tile can't be used (the engine has stopped, US-STATE-08). */
  disabled?: boolean;
  onOpen: () => void;
  onCommand: (command: TileCommand) => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const pressed = useRef(false);

  const show = () => {
    pressed.current = false;
    setOpen(true);
  };
  const endPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    const { clientX: x, clientY: y } = e;
    press.current = {
      x,
      y,
      timer: setTimeout(() => {
        // The finger lifts after the menu opens: that tap mustn't open the app too.
        pressed.current = true;
        setOpen(true);
      }, LONG_PRESS_MS),
    };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > MOVE_PX) endPress();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      show();
    }
  };

  const moving = MOVING.has(app.state);
  const items: ReactNode[] = [];
  const item = (key: string, label: string, glyph: typeof ExternalLink, onSelect: () => void, more = {}) =>
    items.push(
      <DropdownMenuItem key={key} icon={icon(glyph)} onSelect={onSelect} {...more}>
        {label}
      </DropdownMenuItem>,
    );
  item('open', copy.open, ExternalLink, onOpen, { disabled: isAdmin && moving });
  if (isAdmin && moving) {
    item(
      'logs',
      copy.logs,
      TextAlignStart,
      () => void navigate({ to: '/apps/$appId/logs', params: { appId: app.id } }),
    );
  } else if (isAdmin) {
    if (app.state !== 'install_failed') {
      item(
        'settings',
        copy.settings,
        SlidersHorizontal,
        () => void navigate({ to: '/apps/$appId/settings', params: { appId: app.id }, state: { from: '/' } }),
      );
    }
    item(
      'logs',
      copy.logs,
      TextAlignStart,
      () => void navigate({ to: '/apps/$appId/logs', params: { appId: app.id } }),
    );
    if (app.state === 'running' || app.state === 'error') {
      items.push(<DropdownMenuSeparator key="sep-commands" />);
      item('restart', copy.restart, RotateCw, () => onCommand('restart'));
      if (app.state === 'running') item('stop', copy.stop, Square, () => onCommand('stop'));
    } else if (app.state === 'stopped') {
      items.push(<DropdownMenuSeparator key="sep-commands" />);
      item('start', copy.start, Play, () => onCommand('start'));
    }
    items.push(<DropdownMenuSeparator key="sep-uninstall" />);
    item('uninstall', copy.uninstall, Trash2, () => setUninstalling(true), { danger: true });
  }
  // "Edit Home" (US-HOME-16) joins the end of this menu in phase 7 (D-036).

  if (disabled) return children;
  return (
    <div
      ref={holder}
      className="relative"
      onContextMenu={(e) => {
        // Only on tiles: the browser's own menu stays everywhere else.
        e.preventDefault();
        show();
      }}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onClickCapture={(e) => {
        if (!pressed.current) return;
        pressed.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
      <DropdownMenu open={open} onOpenChange={setOpen} modal>
        {/* Where the menu sits: over the tile, which keeps its own click and keys. */}
        <DropdownMenuTrigger asChild>
          <span aria-hidden className="pointer-events-none absolute inset-0" tabIndex={-1} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          // Named by its header, the app's name (Radix would name it after the empty anchor).
          aria-labelledby={labelId}
          align="start"
          className="min-w-56"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            holder.current?.querySelector<HTMLElement>('.hl-app')?.focus();
          }}
        >
          <DropdownMenuLabel id={labelId}>{app.name}</DropdownMenuLabel>
          {items}
        </DropdownMenuContent>
      </DropdownMenu>
      {uninstalling ? <UninstallFor appId={app.id} onClose={() => setUninstalling(false)} /> : null}
    </div>
  );
}

/** "Uninstall…" from a tile: the same dialog as App settings, once the app's details are in (US-APP-11). */
function UninstallFor({ appId, onClose }: { appId: string; onClose: () => void }) {
  const trpc = useTRPC();
  const { data: app } = useQuery({ ...trpc.apps.get.queryOptions({ appId }), retry: false });
  if (!app) return null;
  return <UninstallDialog app={app} open onOpenChange={(next) => (next ? undefined : onClose())} />;
}
