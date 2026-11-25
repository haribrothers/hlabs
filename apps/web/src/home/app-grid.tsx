// The app grid (US-HOME-03): the apps this person can open, in their saved order, each opening in a new tab (or in
// AppWindow when its manifest asks, phase 2). Arrow keys move between tiles. Admins end with "Install app" from
// phase 2 (D-036); members only while they're allowed to install (US-HOME-11, US-ACCT-20).
import { appTileLook, Plus, iconDefaults } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { AppIcon, DOCK_DRAG_TYPE, tokens, useIsPhone, type AppIconState } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { appsCopy } from '../copy/apps';
import { engineCopy } from '../copy/engine';
import { publicCopy } from '../copy/public';
import { homeCopy } from '../copy/home';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import type { HomeApp } from './home-app';
import { TileMenu, type TileCommand } from './tile-menu';
import { useOpenApp } from './use-open-app';
import { AwayPopover } from './away-popover';
import { publicDashboardCopy } from '../copy/public-dashboard';
import { PublicBadge } from '../public/public-badge';
import { HomeOnlyPill, useOnPublic } from '../public/home-only';

export { APP_WINDOW_QUERY, appUrl } from './use-open-app';
export type { HomeApp };

/** The apps in layout order; apps missing from the layout go at the end. */
export function orderApps(apps: readonly HomeApp[], layoutIds: readonly string[]): HomeApp[] {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const ordered = layoutIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const placed = new Set(ordered.map((a) => a.id));
  return [...ordered, ...apps.filter((a) => !placed.has(a.id))];
}

/** Arrow keys between tiles; Up/Down jump a row (the grid's column count). */
function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const tiles = [...e.currentTarget.querySelectorAll<HTMLElement>('li .hl-app')];
  const at = tiles.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  const columns = getComputedStyle(e.currentTarget).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key];
  if (step === undefined) return;
  const next = tiles[at + step];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

/**
 * Every app state as exactly one tile (US-HOME-06): installs and updates fill a ring, moves in between say what's
 * happening, a stopped app is greyed out, a failed install or a crash shows Error (US-STORE-14).
 */
export const TILE: Record<HomeApp['state'], { state: AppIconState; status?: string }> = {
  running: { state: 'running' },
  installing: { state: 'installing' },
  install_failed: { state: 'error' },
  starting: { state: 'busy', status: homeCopy.tileStatus.starting },
  restarting: { state: 'busy', status: homeCopy.tileStatus.restarting },
  stopping: { state: 'busy', status: homeCopy.tileStatus.stopping },
  stopped: { state: 'stopped' },
  updating: { state: 'updating' },
  rolling_back: { state: 'busy', status: homeCopy.tileStatus.rollingBack },
  reinstalling: { state: 'reinstalling' },
  error: { state: 'error' },
  uninstalling: { state: 'busy', status: homeCopy.tileStatus.removing },
};

export function tileState(state: HomeApp['state']): AppIconState {
  return TILE[state].state;
}

export function AppGrid({
  apps,
  isAdmin,
  canInstall = isAdmin,
  progress,
  offline = false,
  onEditHome,
  dockDrag = false,
}: {
  apps: readonly HomeApp[];
  isAdmin: boolean;
  /** Admins, and members while "Install apps from the App Store" is on (US-HOME-11, US-ACCT-20). */
  canInstall?: boolean;
  progress?: ReadonlyMap<string, number>;
  /** The container engine has stopped: every app is offline and its tile can't be used (US-STATE-08). */
  offline?: boolean;
  /** "Edit Home" in each tile's menu (US-HOME-16). */
  onEditHome?: () => void;
  /** Tiles can be dragged onto the Dock to pin them (US-HOME-22). */
  dockDrag?: boolean;
}) {
  const openOnHome = useOpenApp(isAdmin);
  const command = useTileCommands(apps);
  // On the public dashboard (HomePublicAddress): public apps open at their public address, the others say they open
  // at home only, in a popover under the tile on a computer (a sheet on a phone, from useOpenApp).
  const onPublic = useOnPublic();
  const [awayOpen, setAway] = useState<string | null>(null);
  // A phone's tiles are 60px with the 16px radius (D-172): the tile, its shadow and the logo one box.
  const phone = useIsPhone();
  const tile = phone ? tokens.SIZE_APP_ICON_PHONE : tokens.SIZE_APP_ICON;
  const showInstall = canInstall && isFeatureEnabled('appStore');
  const openApp = (app: HomeApp) => {
    if (onPublic && !app.public && !phone) setAway((id) => (id === app.id ? null : app.id));
    else openOnHome(app);
  };
  if (apps.length === 0 && !showInstall) return null;
  return (
    <ul
      aria-label={homeCopy.apps}
      className="hl-home-grid m-0 grid w-full list-none grid-cols-4 gap-x-4 gap-y-6 p-0 max-md:gap-x-0 max-md:gap-y-5 lg:grid-cols-5 xl:grid-cols-6"
      onKeyDown={moveFocus}
    >
      {apps.map((app) => {
        const look = appTileLook(app.name, app.icon, tile);
        const host = app.public?.hostname ?? null;
        const away = onPublic && !app.public;
        const awayId = awayOpen;
        return (
          <li
            key={app.id}
            className="relative flex justify-center"
            data-app={app.id}
            draggable={dockDrag && !offline}
            onDragStart={(e) => {
              e.dataTransfer.setData(DOCK_DRAG_TYPE, app.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <TileMenu
              app={app}
              isAdmin={isAdmin}
              disabled={offline}
              onOpen={() => openApp(app)}
              onCommand={(action) => command(app, action)}
              onEditHome={onEditHome}
            >
              <AppIcon
                name={app.name}
                src={app.icon.logoUrl}
                colors={look.colors}
                icon={look.fallbackIcon}
                state={TILE[app.state].state}
                status={TILE[app.state].status}
                progress={
                  progress?.get(app.id) ?? (app.state === 'installing' || app.state === 'reinstalling' ? 0 : undefined)
                }
                ariaLabel={
                  onPublic
                    ? host
                      ? publicDashboardCopy.tilePublic(app.name, host)
                      : publicDashboardCopy.tileAway(app.name)
                    : app.state === 'running' && !offline
                      ? homeCopy.openApp(app.name)
                      : undefined
                }
                offline={offline ? engineCopy.offline : undefined}
                onClick={() => openApp(app)}
                size={tile}
                radius={phone ? tokens.RADIUS_MD : undefined}
                publicLabel={app.public && !onPublic ? publicCopy.publicBadge : undefined}
                below={
                  onPublic ? (
                    host ? (
                      <>
                        <PublicBadge />
                        <span className="font-mono text-caption whitespace-nowrap text-ink">{host}</span>
                      </>
                    ) : (
                      <HomeOnlyPill label={publicDashboardCopy.atHomeOnly} />
                    )
                  ) : undefined
                }
              />
            </TileMenu>
            {away && awayId === app.id ? (
              <AwayPopover
                name={app.name}
                isAdmin={isAdmin}
                onClose={(focus) => {
                  setAway(null);
                  if (focus)
                    document.querySelector<HTMLElement>(`li[data-app="${CSS.escape(app.id)}"] .hl-app`)?.focus();
                }}
              />
            ) : null}
          </li>
        );
      })}
      {showInstall ? (
        <li className="flex justify-center">
          {offline ? (
            // Nothing can be installed without the engine (US-STATE-08).
            <span className="hl-app hl-app-offline" role="link" aria-disabled="true" title={engineCopy.startFirst}>
              <span className="hl-app-icon grid place-items-center rounded-icon border border-dashed border-border-glass max-md:rounded-md">
                <Plus aria-hidden {...iconDefaults} />
              </span>
              <span className="hl-app-name">{homeCopy.installApp}</span>
            </span>
          ) : (
            <Link to="/store" className="hl-app" aria-label={homeCopy.installApp}>
              <span className="hl-app-icon grid place-items-center rounded-icon border border-dashed border-border-glass max-md:rounded-md">
                <Plus aria-hidden {...iconDefaults} />
              </span>
              <span className="hl-app-name">{homeCopy.installApp}</span>
            </Link>
          )}
        </li>
      ) : null}
    </ul>
  );
}

/** Where each command takes an app at once, and where it settles. */
const MOVES: Record<TileCommand, { now: HomeApp['state']; done: HomeApp['state'] }> = {
  restart: { now: 'restarting', done: 'running' },
  start: { now: 'starting', done: 'running' },
  stop: { now: 'stopping', done: 'stopped' },
};

/**
 * Restart, Start and Stop from a tile's menu (US-HOME-07): the tile moves at once, a toast confirms when the app
 * gets there ("Vaultwarden restarted"), or says it didn't start with the way to its logs; a refusal says why.
 */
function useTileCommands(apps: readonly HomeApp[]) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const waiting = useRef(new Map<string, { action: TileCommand; name: string }>());
  const run = useMutation({
    mutationFn: ({ app, action }: { app: HomeApp; action: TileCommand }) =>
      client.apps[action].mutate({ appId: app.id }),
    onSuccess: (_ok, { app, action }) => {
      waiting.current.set(app.id, { action, name: app.name });
      // Restarting an app that isn't responding starts it again (US-APP-03).
      const now = action === 'restart' && app.state === 'error' ? 'starting' : MOVES[action].now;
      queryClient.setQueryData(trpc.apps.list.queryKey(), (old) =>
        old ? { apps: old.apps.map((a) => (a.id === app.id ? { ...a, state: now } : a)) } : old,
      );
    },
    onError: (err) => {
      if (!handledGlobally(err)) showErrorToast(err);
    },
  });
  useEffect(() => {
    for (const app of apps) {
      const pending = waiting.current.get(app.id);
      if (!pending) continue;
      if (app.state === MOVES[pending.action].done) {
        waiting.current.delete(app.id);
        const said = { restart: homeCopy.menu.restarted, start: homeCopy.menu.started, stop: homeCopy.menu.stopped };
        showToast({ tone: 'success', title: said[pending.action](pending.name) });
      } else if (app.state === 'error') {
        waiting.current.delete(app.id);
        showToast({
          tone: 'danger',
          title: appsCopy.didntStart(pending.name),
          actions: [{ kind: 'navigate', label: appsCopy.logs, to: `/apps/${app.id}/logs`, admin: true }],
        });
      }
    }
  }, [apps]);
  return (app: HomeApp, action: TileCommand) => run.mutate({ app, action });
}
