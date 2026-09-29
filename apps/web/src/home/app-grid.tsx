// The app grid (US-HOME-03): the apps this person can open, in their saved order, each opening in a new tab (or in
// AppWindow when its manifest asks, phase 2). Arrow keys move between tiles. Admins end with "Install app" from
// phase 2 (D-036).
import type { AppRouter } from '@hlabs/api';
import { appTileLook, Plus, iconDefaults } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { AppIcon, type AppIconState } from '@hlabs/ui';
import { Link, useNavigate } from '@tanstack/react-router';
import type { inferRouterOutputs } from '@trpc/server';
import type { KeyboardEvent } from 'react';
import { homeCopy } from '../copy/home';
import { browser } from '../lib/browser';

export type HomeApp = inferRouterOutputs<AppRouter>['apps']['list']['apps'][number];

/** On the tailnet name, apps open on their port there (D-012); otherwise on their .local hostname. */
export function appUrl(app: HomeApp, location: Pick<Location, 'hostname'> = window.location): string {
  return location.hostname.endsWith('.ts.net') && app.urls.tailnet ? app.urls.tailnet : app.urls.local;
}

/** The apps in layout order; apps missing from the layout go at the end. */
export function orderApps(apps: readonly HomeApp[], layoutIds: readonly string[]): HomeApp[] {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const ordered = layoutIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const placed = new Set(ordered.map((a) => a.id));
  return [...ordered, ...apps.filter((a) => !placed.has(a.id))];
}

/** Arrow keys between tiles; Up/Down jump a row (the grid's column count). */
function moveFocus(e: KeyboardEvent<HTMLElement>) {
  const tiles = [...e.currentTarget.querySelectorAll<HTMLElement>('li > .hl-app')];
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

/** The tile's state: installing shows its ring, a failed install or a crash an error badge (US-STORE-14). */
export function tileState(state: HomeApp['state']): AppIconState {
  if (state === 'installing') return 'installing';
  if (state === 'install_failed' || state === 'error') return 'error';
  if (state === 'stopped') return 'stopped';
  return 'running';
}

export function AppGrid({
  apps,
  isAdmin,
  progress,
}: {
  apps: readonly HomeApp[];
  isAdmin: boolean;
  progress?: ReadonlyMap<string, number>;
}) {
  const navigate = useNavigate();
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
            <AppIcon
              name={app.name}
              src={app.icon.logoUrl}
              colors={look.colors}
              icon={look.fallbackIcon}
              state={tileState(app.state)}
              progress={progress?.get(app.id) ?? 0}
              ariaLabel={app.state === 'running' ? homeCopy.openApp(app.name) : undefined}
              // AppWindow for embedded apps arrives with US-APP-01; until then every app opens in a new tab. An install
              // that's running or failed opens its page (US-STORE-12, US-STORE-14).
              onClick={() => {
                if (app.state === 'running') browser.open(appUrl(app));
                else if (app.state === 'installing' || app.state === 'install_failed')
                  void navigate({ to: '/store/install/$appId', params: { appId: app.id } });
              }}
            />
          </li>
        );
      })}
      {showInstall ? (
        <li className="flex justify-center">
          <Link to="/store" className="hl-app" aria-label={homeCopy.installApp}>
            <span className="hl-app-icon grid place-items-center rounded-icon border border-dashed border-border-glass">
              <Plus aria-hidden {...iconDefaults} />
            </span>
            <span className="hl-app-name">{homeCopy.installApp}</span>
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
