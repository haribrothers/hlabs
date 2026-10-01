// Main (US-HOME-01…05): the greeting over the wallpaper, the widgets row and the app grid.
import { iconDefaults, LogoMark, Search } from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import { GlassCard } from '@hlabs/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { EngineBanner } from './engine-banner';
import { useEngineRunning } from '../lib/engine-state';

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
      { types: ['app.stateChanged', 'app.installProgress'] },
      {
        onData: ({ data: event }) => {
          if (event.type === 'app.installProgress') {
            const { appId, progress: pct } = event.data;
            setProgress((m) => (m.get(appId) === pct ? m : new Map(m).set(appId, pct)));
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

  return (
    <div className="mx-auto flex w-full max-w-window flex-col items-center gap-8">
      <header className="flex flex-col items-center gap-4 text-center">
        <GlassCard className="grid size-12 place-items-center rounded-lg p-0" aria-hidden="true">
          <LogoMark size={28} title="" />
        </GlassCard>
        <h1 className={showGreeting && name ? 'm-0 text-display-xl' : 'sr-only'}>
          {name ? homeCopy.greeting[greetingFor(now)](name) : homeCopy.title}
        </h1>
        {isFeatureEnabled('search') ? <SearchPill /> : null}
      </header>
      {me.data?.appearance.showWidgets !== false && layout.data ? (
        <WidgetsRow ids={layout.data.items.filter((i) => i.kind === 'widget').map((i) => i.id)} />
      ) : null}
      {apps.data ? (
        <AppGrid
          apps={orderApps(
            apps.data.apps,
            (layout.data?.items ?? []).filter((i) => i.kind === 'app').map((i) => i.id),
          )}
          isAdmin={me.data?.role === 'admin'}
          progress={progress}
          offline={engineDown}
        />
      ) : null}
      <EngineBanner down={engineDown} />
    </div>
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
