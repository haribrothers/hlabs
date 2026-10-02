// The app grid (US-HOME-03): the apps this person can open, in their saved order, each opening in a new tab (or in
// AppWindow when its manifest asks, phase 2). Arrow keys move between tiles. Admins end with "Install app" from
// phase 2 (D-036).
import { appTileLook, Plus, iconDefaults } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { AppIcon, type AppIconState } from '@hlabs/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { appsCopy } from '../copy/apps';
import { engineCopy } from '../copy/engine';
import { homeCopy } from '../copy/home';
import { handledGlobally, showErrorToast } from '../lib/error-copy';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';
import type { HomeApp } from './home-app';
import { TileMenu, type TileCommand } from './tile-menu';
import { useOpenApp } from './use-open-app';

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
  error: { state: 'error' },
  uninstalling: { state: 'busy', status: homeCopy.tileStatus.removing },
};

export function tileState(state: HomeApp['state']): AppIconState {
  return TILE[state].state;
}

export function AppGrid({
  apps,
  isAdmin,
  progress,
  offline = false,
}: {
  apps: readonly HomeApp[];
  isAdmin: boolean;
  progress?: ReadonlyMap<string, number>;
  /** The container engine has stopped: every app is offline and its tile can't be used (US-STATE-08). */
  offline?: boolean;
}) {
  const openApp = useOpenApp(isAdmin);
  const command = useTileCommands(apps);
  const showInstall = isAdmin && isFeatureEnabled('appStore');
  if (apps.length === 0 && !showInstall) return null;
  return (
    <ul
      aria-label={homeCopy.apps}
      className="m-0 grid w-full list-none grid-cols-4 gap-x-4 gap-y-6 p-0 lg:grid-cols-5 xl:grid-cols-6"
      onKeyDown={moveFocus}
    >
      {apps.map((app) => {
        const look = appTileLook(app.name, app.icon);
        return (
          <li key={app.id} className="flex justify-center" data-app={app.id}>
            <TileMenu
              app={app}
              isAdmin={isAdmin}
              disabled={offline}
              onOpen={() => openApp(app)}
              onCommand={(action) => command(app, action)}
            >
              <AppIcon
                name={app.name}
                src={app.icon.logoUrl}
                colors={look.colors}
                icon={look.fallbackIcon}
                state={TILE[app.state].state}
                status={TILE[app.state].status}
                progress={progress?.get(app.id) ?? (app.state === 'installing' ? 0 : undefined)}
                ariaLabel={app.state === 'running' && !offline ? homeCopy.openApp(app.name) : undefined}
                offline={offline ? engineCopy.offline : undefined}
                onClick={() => openApp(app)}
              />
            </TileMenu>
          </li>
        );
      })}
      {showInstall ? (
        <li className="flex justify-center">
          {offline ? (
            // Nothing can be installed without the engine (US-STATE-08).
            <span className="hl-app hl-app-offline" role="link" aria-disabled="true" title={engineCopy.startFirst}>
              <span className="hl-app-icon grid place-items-center rounded-icon border border-dashed border-border-glass">
                <Plus aria-hidden {...iconDefaults} />
              </span>
              <span className="hl-app-name">{homeCopy.installApp}</span>
            </span>
          ) : (
            <Link to="/store" className="hl-app" aria-label={homeCopy.installApp}>
              <span className="hl-app-icon grid place-items-center rounded-icon border border-dashed border-border-glass">
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
