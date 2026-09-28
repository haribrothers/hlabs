// Main (US-HOME-01…05): the greeting over the wallpaper, the widgets row and the app grid.
import { LogoMark } from '@hlabs/icons';
import { GlassCard } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { homeCopy } from '../copy/home';
import { useTRPC } from '../lib/trpc';
import { useMe } from '../lib/use-me';
import { useNow } from '../lib/use-now';
import { greetingFor } from './greeting';
import { WidgetsRow } from './widgets';

export function HomeView() {
  const trpc = useTRPC();
  const me = useMe();
  const layout = useQuery({ ...trpc.home.getLayout.queryOptions(), retry: false });
  const now = useNow();
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
      </header>
      {me.data?.appearance.showWidgets !== false && layout.data ? (
        <WidgetsRow ids={layout.data.items.filter((i) => i.kind === 'widget').map((i) => i.id)} />
      ) : null}
    </div>
  );
}
