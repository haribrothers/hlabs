// The Settings window (US-ACCT-01, US-ACCT-02): the sections this person can use on the left and the open section on
// the right. On a phone the list comes first and a section opens as a sheet with a "Settings" back control. Escape
// closes the window and puts focus back where it was on Home.
import { ChevronLeft, ChevronRight, iconDefaults } from '@hlabs/icons';
import { GlassCard } from '@hlabs/ui';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { settingsCopy } from '../copy/settings';
import { useIsDesktop } from '../lib/use-media';
import { useMe } from '../lib/use-me';
import { sectionPath, visibleSections } from './sections';

const copy = settingsCopy;

/** Up/Down move between sections in the sidebar (US-ACCT-02). */
function moveInList(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const links = [...e.currentTarget.querySelectorAll<HTMLElement>('a')];
  const at = links.indexOf(document.activeElement as HTMLElement);
  const next = links[at + (e.key === 'ArrowDown' ? 1 : -1)];
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

export function SettingsLayout() {
  const me = useMe().data;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const desktop = useIsDesktop();
  const atList = pathname === '/settings' || pathname === '/settings/';
  // Where focus was before Settings opened (the Dock tile, usually), to give it back on Escape.
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const back = returnTo.current;
      void navigate({ to: '/' }).then(() => {
        if (back?.isConnected) back.focus();
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (!me) return null;
  const sections = visibleSections(me.role);
  const sidebar = (
    <nav aria-label={copy.sections} onKeyDown={moveInList}>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {sections.map((s) => (
          <li key={s.id}>
            <Link
              to={sectionPath(s.id)}
              className="hl-focus flex min-h-11 items-center justify-between rounded-md px-3 text-body text-ink no-underline hover:bg-surface-control aria-[current=page]:bg-accent-wash aria-[current=page]:font-semibold"
              activeProps={{ 'aria-current': 'page' }}
            >
              {s.label}
              {desktop ? null : <ChevronRight aria-hidden {...iconDefaults} className="size-4 text-ink-muted" />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );

  if (!desktop) {
    return (
      <div className="flex w-full flex-col gap-4">
        {atList ? (
          <>
            <h1 className="m-0 text-display">{copy.title}</h1>
            <GlassCard className="p-2">{sidebar}</GlassCard>
          </>
        ) : (
          <>
            <Link
              to="/settings"
              className="hl-focus inline-flex items-center gap-1 self-start rounded-xs text-body text-ink no-underline"
            >
              <ChevronLeft aria-hidden {...iconDefaults} />
              {copy.back}
            </Link>
            <GlassCard level={2} className="p-5">
              <Outlet />
            </GlassCard>
          </>
        )}
      </div>
    );
  }

  return (
    <GlassCard level={2} className="mx-auto grid w-full max-w-window grid-cols-[240px_1fr] overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-r border-glass p-5">
        <p className="m-0 px-3 text-title-2 font-bold" aria-hidden="true">
          {copy.title}
        </p>
        {sidebar}
      </div>
      <div className="min-w-0 p-7">
        <Outlet />
      </div>
    </GlassCard>
  );
}
