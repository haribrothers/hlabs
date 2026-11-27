// Settings › Appearance with a fake daemon that keeps what's saved, beside what the shell does with it (the
// attributes on <html> and the wallpaper), for the US-ACCT-32…35 tests.
import { vi } from 'vitest';
import type { Appearance } from '../lib/appearance';
import { useAppearance, wallpaperClass, wallpaperStyle } from '../lib/appearance';
import { useMe } from '../lib/use-me';
import { AppearanceSection } from '../settings/appearance-section';
import { fakeMe } from './me';
import { renderScreen, type Handlers } from './render';

export const DEFAULT_APPEARANCE: Appearance = {
  wallpaper: 'dusk',
  customWallpaperUrl: null,
  accent: 'violet',
  reduceTransparency: false,
  reduceMotion: null,
  showWidgets: true,
  showGreeting: true,
};

/** The section inside a stand-in shell: the wallpaper behind it and the person's look on <html>. */
function Screen() {
  const appearance = useMe().data?.appearance;
  useAppearance(appearance);
  return (
    <div data-testid="wallpaper" className={wallpaperClass(appearance)} style={wallpaperStyle(appearance)}>
      <AppearanceSection />
    </div>
  );
}

export function renderAppearance(start: Partial<Appearance> = {}, handlers: Handlers = {}) {
  const state = { appearance: { ...DEFAULT_APPEARANCE, ...start } };
  const update = vi.fn((change: Partial<Appearance>) => {
    state.appearance = { ...state.appearance, ...change };
    return { ok: true };
  });
  const result = renderScreen(Screen, {
    'auth.me': () => fakeMe({ appearance: state.appearance })(),
    'settings.appearance.update': update as never,
    ...handlers,
  });
  return { ...result, update, state };
}

/** Back to how a fresh page starts. */
export function resetRoot() {
  const root = document.documentElement;
  for (const name of ['accent', 'theme', 'motion']) delete root.dataset[name];
  localStorage.clear();
}
