// The Home shell: wallpaper, the current area, and navigation. Dock at ≥ 768px, tab bar on phones (D-054).
import { Dock, TabBar, type AreaId } from '@hlabs/ui';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { shellCopy } from '../copy/shell';
import { AREA_PATHS, areaForPath, navigationAreas, phoneAreas } from './areas';

export function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = areaForPath(pathname);
  const areas = navigationAreas();
  const go = (id: string) => void navigate({ to: AREA_PATHS[id as AreaId] });

  return (
    <div className="hl-wall relative flex min-h-full flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-pill focus:bg-fill-primary focus:px-4 focus:py-2 focus:text-ink-on-light"
      >
        {shellCopy.skipToContent}
      </a>
      <main
        id="main"
        aria-label={shellCopy.mainLabel}
        className="flex flex-1 flex-col px-4 pt-10 pb-36 md:px-10 md:pt-14 md:pb-40"
      >
        {children}
      </main>
      {/* Search, the + tile and pinned apps arrive with their phases (D-036). */}
      <div className="hl-nav-desktop hidden md:flex" data-testid="dock-bar">
        <Dock areas={areas} active={active} onSelect={go} search={false} />
      </div>
      <div className="hl-nav-phone flex md:hidden" data-testid="tab-bar">
        <TabBar items={phoneAreas()} active={active} onSelect={go} />
      </div>
    </div>
  );
}
