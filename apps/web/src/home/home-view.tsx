// Main (US-HOME-01…05): the greeting over the wallpaper, the widgets row and the app grid.
import { iconDefaults, LOGO_SCALE, LogoMark, Plus, Search } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { GlassCard, tokens } from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useEffect, useState } from 'react';
import { homeCopy } from '../copy/home';
import { searchCopy } from '../copy/search';
import { isMac, openSearch } from '../search/search-state';
import { useTRPC } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { useNow } from '../lib/use-now';
import { AppGrid, orderApps } from './app-grid';
import { greetingFor } from './greeting';
import { WidgetsRow } from './widgets';
import { EngineBanner, StartEngineButton } from './engine-banner';
import { useEngineRunning } from '../lib/engine-state';
import { NotificationsBell } from './notifications';

export function HomeView() {
  const trpc = useTRPC();
  const me = useMe();
  const queryClient = useQueryClient();
  const layout = useQuery({ ...trpc.home.getLayout.queryOptions(), retry: false });
  const apps = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  const [progress, setProgress] = useState(() => new Map<string, number>());
  // Installed, removed or changed apps show up without a reload (US-HOME-03); installs fill their ring (US-STORE-12).
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['app.stateChanged', 'app.installProgress', 'job.progress'] },
      {
        onData: ({ data: event }) => {
          if (event.type === 'app.installProgress') {
            const { appId, progress: pct } = event.data;
            setProgress((m) => (m.get(appId) === pct ? m : new Map(m).set(appId, pct)));
            return;
          }
          // A reinstall fills its tile's ring too (US-APP-24).
          if (event.type === 'job.progress') {
            const { kind, target, progress: pct } = event.data;
            if (kind === 'app_reinstall' && target) {
              setProgress((m) => (m.get(target) === pct ? m : new Map(m).set(target, pct)));
            }
            return;
          }
          void queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
          void queryClient.invalidateQueries({ queryKey: trpc.home.getLayout.queryKey() });
        },
      },
    ),
  );
  const now = useNow();
  // The engine stopped (US-STATE-08): apps are offline, the rest of Home stays live.
  const engineDown = useEngineRunning(Boolean(me.data)) === false;
  useEffect(() => {
    document.title = homeCopy.title;
  }, []);

  const name = me.data ? me.data.displayName.trim() || me.data.username : '';
  const showGreeting = me.data?.appearance.showGreeting ?? true;
  // Nothing installed (or shared with me) yet: a welcome and where to start (US-HOME-15). Apps only removed from
  // Home still count, since apps.list is what's installed and visible, not the layout.
  const empty = apps.data?.apps.length === 0;
  const canInstall = me.data?.canInstallApps ?? false;

  return (
    <div className="mx-auto flex w-full max-w-window flex-col items-center gap-8">
      <header className="flex flex-col items-center gap-4 text-center">
        {/* The size of a Home app icon, with the mark inset as app logos are. */}
        <GlassCard
          className="grid size-(--size-app-icon) place-items-center rounded-(--radius-icon) p-0"
          aria-hidden="true"
        >
          <LogoMark size={Math.round(tokens.SIZE_APP_ICON * LOGO_SCALE)} title="" />
        </GlassCard>
        <h1 className={showGreeting && name ? 'm-0 text-display-xl' : 'sr-only'}>
          {name ? (empty ? homeCopy.empty.welcome(name) : homeCopy.greeting[greetingFor(now)](name)) : homeCopy.title}
        </h1>
        {isFeatureEnabled('search') ? <SearchPill /> : null}
      </header>
      {me.data?.appearance.showWidgets !== false && layout.data ? (
        <WidgetsRow ids={layout.data.items.filter((i) => i.kind === 'widget').map((i) => i.id)} />
      ) : null}
      {empty ? (
        <EmptyHome canInstall={canInstall && isFeatureEnabled('appStore')} offline={engineDown} />
      ) : apps.data ? (
        <AppGrid
          apps={orderApps(
            apps.data.apps,
            (layout.data?.items ?? []).filter((i) => i.kind === 'app').map((i) => i.id),
          )}
          isAdmin={me.data?.role === 'admin'}
          canInstall={canInstall}
          progress={progress}
          offline={engineDown}
        />
      ) : null}
      <EngineBanner down={engineDown} actions={me.data?.role === 'admin' ? <StartEngineButton /> : null} />
      <NotificationsBell />
    </div>
  );
}

/**
 * Home before any app (US-HOME-15; HomeEmpty): the "Install app" tile, what people usually start with and the way
 * to the App Store, or, for a member who can't install, who to ask.
 */
function EmptyHome({ canInstall, offline }: { canInstall: boolean; offline: boolean }) {
  const trpc = useTRPC();
  const account = useQuery({ ...trpc.account.get.queryOptions(), enabled: !canInstall, retry: false });
  return (
    <section
      aria-labelledby="home-empty-title"
      className="hl-glass hl-glass-1 flex w-full flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-dashed border-border-glass px-10 py-8"
    >
      {canInstall && !offline ? (
        <Link to="/store" className="hl-app" aria-label={homeCopy.installApp}>
          <span className="hl-app-icon grid place-items-center rounded-icon border border-dashed border-border-glass">
            <Plus aria-hidden {...iconDefaults} />
          </span>
          <span className="hl-app-name">{homeCopy.installApp}</span>
        </Link>
      ) : null}
      <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
        <h2 id="home-empty-title" className="m-0 text-title-2">
          {homeCopy.empty.title}
        </h2>
        <p className="m-0 text-body text-ink-muted">
          {canInstall ? homeCopy.empty.body : homeCopy.empty.askAdmin(account.data?.adminName ?? null)}
        </p>
      </div>
      {canInstall && !offline ? (
        <Link to="/store" className="hl-btn hl-btn-primary hl-btn-md hl-focus">
          {homeCopy.browseStore}
        </Link>
      ) : null}
    </section>
  );
}

/** "Search apps, files, settings" under the greeting, with the shortcut (US-HOME-09). */
export function SearchPill() {
  return (
    <button
      type="button"
      onClick={openSearch}
      className="hl-focus hl-glass hl-glass-1 flex min-h-11 w-full max-w-sm items-center gap-3 rounded-pill px-5 py-2.5 text-body text-ink-muted"
    >
      <Search aria-hidden {...iconDefaults} className="size-4 shrink-0" />
      <span className="flex-1 text-left">{searchCopy.pill}</span>
      <kbd aria-hidden className="rounded-xs bg-surface-control px-1.5 py-0.5 font-sans text-caption">
        {searchCopy.shortcut(isMac())}
      </kbd>
    </button>
  );
}
