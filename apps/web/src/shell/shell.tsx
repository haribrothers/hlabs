// The Home shell: wallpaper, the current area, and navigation. Dock at ≥ 768px, tab bar on phones (D-054).
import { Dock, TabBar, type AreaId } from '@hlabs/ui';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { shellCopy } from '../copy/shell';
import { useAppearance, wallpaperClass } from '../lib/appearance';
import { useMe } from '../lib/use-me';
import { AREA_PATHS, areaForPath, navigationAreas, phoneAreas, storeBadge, type NavAccess } from './areas';

export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = areaForPath(pathname);
  // The app window has the screen to itself (US-APP-01): no Dock or tab bar under it.
  const appWindow = pathname.startsWith('/apps/');
  const go = (id: string) => void navigate({ to: AREA_PATHS[id as AreaId] });
  const me = useMe().data;
  // The person's wallpaper and accent (US-HOME-01); signed out (development pages) it's the defaults.
  const appearance = me?.appearance;
  useAppearance(appearance);
  // Members see fewer areas (US-HOME-05). The update count comes from the App Store updates list (phase 7).
  const access: NavAccess | undefined = me
    ? { role: me.role, canSeeUsage: me.canSeeUsage, canInstallApps: me.canInstallApps }
    : undefined;
  const store = storeBadge(0, { access });
  const areas = navigationAreas({ access });
  const tabs = phoneAreas({ access }).map((a) => (a.id === 'store' && store ? { ...a, badge: store } : a));

  return (
    // Exactly the viewport: pages scroll inside main, and windows (Settings) can fill it without the page scrolling.
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
      {/* Search, the + tile and pinned apps arrive with their phases (D-036). */}
      {appWindow ? null : (
        <>
          <div className="hl-nav-desktop hidden md:flex" data-testid="dock-bar">
            <Dock areas={areas} active={active} onSelect={go} badges={store ? { store } : {}} search={false} />
          </div>
          <div className="hl-nav-phone flex md:hidden" data-testid="tab-bar">
            <TabBar items={tabs} active={active} onSelect={go} />
          </div>
        </>
      )}
    </div>
  );
}
