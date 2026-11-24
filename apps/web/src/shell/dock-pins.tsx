// Pinned apps in the Dock (US-HOME-22; DockStates 04, 05): up to eight per person, from "+" or by dragging an app from
// Home; a menu on each (Open, Open in a new tab, App settings for admins, Remove from Dock); moved by dragging sideways
// or Alt+Left/Right. Saved at once, optimistically; apps that are gone drop out (the daemon filters them).
import { appTileLook, AppLogo } from '@hlabs/icons';
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  type DockApp,
} from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useOpenWindows } from '../apps/open-windows';
import { browser } from '../lib/browser';
import { dockCopy as copy } from '../copy/dock';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { appUrl, useOpenApp } from '../home/use-open-app';
import type { HomeApp } from '../home/home-app';
import { useAppOverlay } from '../apps/app-overlay';

export const MAX_DOCK = 8;

/** Places a menu or popover at a Dock tile: a fixed, invisible box over it. */
function anchorStyle(r: DOMRect) {
  return { position: 'fixed' as const, left: r.left, top: r.top, width: r.width, height: r.height };
}

export function useDockPins(signedIn: boolean, shippedPhase = VISIBLE_PHASE) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const overlay = useAppOverlay();
  const isAdmin = useMe(signedIn).data?.role === 'admin';
  const openApp = useOpenApp(isAdmin);
  const open = useOpenWindows();
  const enabled = signedIn && isFeatureEnabled('dockPins', shippedPhase);
  const layout = useQuery({ ...trpc.home.getLayout.queryOptions(), enabled, retry: false });
  const list = useQuery({
    ...trpc.apps.list.queryOptions(),
    enabled: signedIn && (enabled || open.length > 0),
    retry: false,
  });
  const menuLabel = useId();
  const [menu, setMenu] = useState<{ id: string; rect: DOMRect; tile: HTMLElement } | null>(null);
  const [adding, setAdding] = useState<{ rect: DOMRect; tile: HTMLElement } | null>(null);

  const byId = new Map((list.data?.apps ?? []).map((a) => [a.id, a]));
  const pinned = enabled ? (layout.data?.dock ?? []).filter((id) => byId.has(id)) : [];
  const toTile = (app: HomeApp, isPinned: boolean): DockApp => {
    const look = appTileLook(app.name, app.icon);
    return {
      id: app.id,
      name: app.name,
      logo: app.icon.logoUrl,
      colors: look.colors,
      icon: look.fallbackIcon,
      open: open.includes(app.id),
      pinned: isPinned,
    };
  };
  // Pinned apps first, then apps whose window is open (US-HOME-23).
  const apps: DockApp[] = [
    ...pinned.map((id) => toTile(byId.get(id)!, true)),
    ...open.filter((id) => !pinned.includes(id) && byId.has(id)).map((id) => toTile(byId.get(id)!, false)),
  ];

  const save = async (dock: string[]) => {
    const key = trpc.home.getLayout.queryKey();
    const before = queryClient.getQueryData(key);
    queryClient.setQueryData(key, (old) => (old ? { ...old, dock } : old));
    try {
      await client.home.saveDock.mutate({ appIds: dock });
    } catch (err) {
      queryClient.setQueryData(key, before);
      if (!handledGlobally(err)) showErrorToast(err);
    }
  };
  const pin = (id: string, at = pinned.length) => {
    if (pinned.includes(id) || pinned.length >= MAX_DOCK) return;
    void save([...pinned.slice(0, at), id, ...pinned.slice(at)]);
  };
  const move = (id: string, at: number) => {
    const rest = pinned.filter((p) => p !== id);
    void save([...rest.slice(0, at), id, ...rest.slice(at)]);
  };
  const unpin = (id: string) => void save(pinned.filter((p) => p !== id));

  const menuApp = menu ? byId.get(menu.id) : undefined;
  const overlays: ReactNode = (
    <>
      {menu && menuApp ? (
        <DropdownMenu
          open
          onOpenChange={(o) => {
            if (!o) setMenu(null);
          }}
          modal
        >
          <DropdownMenuTrigger asChild>
            <span aria-hidden tabIndex={-1} className="pointer-events-none" style={anchorStyle(menu.rect)} />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="center"
            // Named by its header, the app's name (Radix would name it after the empty anchor).
            aria-labelledby={menuLabel}
            className="min-w-52"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              menu.tile.focus();
            }}
          >
            <DropdownMenuLabel id={menuLabel}>{menuApp.name}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => openApp(menuApp)}>{copy.open}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => browser.open(appUrl(menuApp))}>{copy.openInNewTab}</DropdownMenuItem>
            {isAdmin ? (
              <DropdownMenuItem onSelect={() => overlay.openSettings(menuApp.id)}>{copy.appSettings}</DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => unpin(menuApp.id)}>{copy.remove}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {adding ? (
        <AddToDock
          rect={adding.rect}
          apps={(list.data?.apps ?? []).filter((a) => !pinned.includes(a.id))}
          full={pinned.length >= MAX_DOCK}
          onAdd={(id) => pin(id)}
          onClose={() => {
            setAdding(null);
            adding.tile.focus();
          }}
        />
      ) : null}
    </>
  );

  return {
    apps,
    overlays,
    canDrop: pinned.length < MAX_DOCK,
    ...(enabled
      ? {
          onAdd: (tile: HTMLElement) => setAdding({ rect: tile.getBoundingClientRect(), tile }),
          onAppMenu: (id: string, tile: HTMLElement) => setMenu({ id, rect: tile.getBoundingClientRect(), tile }),
          onMoveApp: move,
          // A finger that held a pinned app moves it: its menu goes (US-TAB-03).
          onAppMenuClose: () => setMenu(null),
          onDropApp: (id: string, at: number) => pin(id, at),
        }
      : {}),
  };
}

/** "Add to Dock" (DockStates 05): the apps not pinned yet, or that the Dock is full; on level-3 glass above "+". */
function AddToDock({
  rect,
  apps,
  full,
  onAdd,
  onClose,
}: {
  rect: DOMRect;
  apps: readonly HomeApp[];
  full: boolean;
  onAdd: (id: string) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);
  return (
    <div
      ref={panel}
      role="dialog"
      aria-label={copy.addToDock}
      className="hl-glass hl-glass-3 hl-anim-panel fixed z-50 flex w-72 flex-col gap-2 rounded-lg p-4 shadow-menu"
      style={{ bottom: window.innerHeight - rect.top + 12, left: Math.max(16, rect.right - 288) }}
    >
      <h2 className="m-0 text-body-sm font-semibold text-ink-muted">{copy.addToDock}</h2>
      {full ? (
        <p className="m-0 text-body-sm">{copy.full}</p>
      ) : apps.length === 0 ? (
        <p className="m-0 text-body-sm text-ink-muted">{copy.allPinned}</p>
      ) : (
        <ul className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-y-auto p-0">
          {apps.map((app) => {
            const look = appTileLook(app.name, app.icon);
            return (
              <li key={app.id} className="flex items-center gap-3">
                <AppLogo
                  decorative
                  name={app.name}
                  src={app.icon.logoUrl}
                  colors={look.colors}
                  fallbackIcon={look.fallbackIcon}
                  size={28}
                  radius={8}
                />
                <span className="flex-1 truncate text-body-sm">{app.name}</span>
                <Button variant="secondary" size="sm" onClick={() => onAdd(app.id)} aria-label={copy.addApp(app.name)}>
                  {copy.add}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="m-0 text-caption text-ink-muted">{copy.hint}</p>
    </div>
  );
}
