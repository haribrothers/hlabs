// Main (US-HOME-01…05): the greeting over the wallpaper, the widgets row and the app grid.
import { LogoMark } from '@hlabs/icons';
import { GlassCard } from '@hlabs/ui';
import { useEffect } from 'react';
import { homeCopy } from '../copy/home';
import { useMe } from '../lib/use-me';
import { useNow } from '../lib/use-now';
import { greetingFor } from './greeting';

export function HomeView() {
  const me = useMe();
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
    </div>
  );
}
