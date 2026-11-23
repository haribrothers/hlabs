// The Home shell: wallpaper, the current area, and navigation. Dock at ≥ 768px, tab bar on phones (D-054).
import { Dock, TabBar, type AreaId } from '@hlabs/ui';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { shellCopy } from '../copy/shell';
import { useAppearance, wallpaperClass } from '../lib/appearance';
import { isFeatureEnabled } from '@hlabs/shared';
import { EngineWatch } from '../lib/engine-state';
import { openSearch } from '../search/search-state';
import { Spotlight, useSearchShortcut } from '../search/spotlight';
import { AppOverlay } from '../apps/app-overlay';
import { useMe } from '../lib/use-me';
import { useDockPins } from './dock-pins';
import { usePendingUpdates } from './pending-updates';
import { AREA_PATHS, areaForPath, navigationAreas, phoneAreas, storeBadge, type NavAccess } from './areas';

export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = areaForPath(pathname);
  // App pages (window, settings, logs): the Dock stays on desktop so open apps can be switched (US-HOME-23, D-096);
  // a phone has no app windows, and its tab bar stays off those pages.
  const appPage = pathname.startsWith('/apps/');
  const go = (id: string) => void navigate({ to: AREA_PATHS[id as AreaId] });
  const me = useMe().data;
  // The person's wallpaper and accent (US-HOME-01); signed out (development pages) it's the defaults.
  const appearance = me?.appearance;
  useAppearance(appearance);
  // Members see fewer areas (US-HOME-05). The update count comes from the App Store updates list (phase 7, admins).
  const access: NavAccess | undefined = me
    ? { role: me.role, canSeeUsage: me.canSeeUsage, canInstallApps: me.canInstallApps }
    : undefined;
  const store = storeBadge(usePendingUpdates(me?.role === 'admin'), { access });
  const areas = navigationAreas({ access });
  const tabs = phoneAreas({ access }).map((a) => (a.id === 'store' && store ? { ...a, badge: store } : a));
  // Pinned apps, then open windows (US-HOME-22, US-HOME-23).
  const dock = useDockPins(Boolean(me));
  // Search from anywhere, once signed in (US-HOME-09).
  const search = Boolean(me) && isFeatureEnabled('search');
  useSearchShortcut(search);

  return (
    // Exactly the viewport: pages scroll inside main, and windows (Settings) can fill it without the page scrolling.
    // .hl-window-fill (packages/ui components.css) undoes main's desktop padding to make a window app-window tall.
    <div className={`${wallpaperClass(appearance?.wallpaper)} relative flex h-dvh flex-col`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-pill focus:bg-fill-primary focus:px-4 focus:py-2 focus:text-ink-on-light"
      >
        {shellCopy.skipToContent}
      </a>
      <main
        id="main"
        aria-label={shellCopy.mainLabel}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-10 pb-36 md:px-10 md:pt-14 md:pb-40"
      >
        {children}
      </main>
      {search ? <Spotlight /> : null}
      {/* App settings and Logs over the page (D-166). */}
      {me ? <AppOverlay /> : null}
      {me ? <EngineWatch /> : null}
      <>
        <div className="hl-nav-desktop hidden md:flex" data-testid="dock-bar">
          <Dock
            areas={areas}
            active={active}
            onSelect={go}
            badges={store ? { store } : {}}
            search={search}
            onSearch={openSearch}
            apps={dock.apps}
            onOpenApp={(appId) => void navigate({ to: '/apps/$appId', params: { appId } })}
            onAdd={dock.onAdd}
            onAppMenu={dock.onAppMenu}
            onMoveApp={dock.onMoveApp}
            onDropApp={dock.onDropApp}
            canDrop={dock.canDrop}
          />
          {dock.overlays}
        </div>
        {appPage ? null : (
          <div className="hl-nav-phone flex md:hidden" data-testid="tab-bar">
            <TabBar items={tabs} active={active} onSelect={go} />
          </div>
        )}
      </>
    </div>
  );
}
