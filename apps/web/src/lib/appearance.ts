// Applies the person's appearance (D-010, US-HOME-01): accent and reduce motion on <html>, the wallpaper on the
// shell. Only Dusk exists until Settings › Appearance adds more (phase 7); anything unknown draws Dusk.
import type { AppRouter } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';
import { useEffect } from 'react';

export type Appearance = inferRouterOutputs<AppRouter>['auth']['me']['appearance'];

/** Wallpaper id → the class that draws it. */
export const WALLPAPERS: Record<string, string> = { dusk: 'hl-wall' };

export const wallpaperClass = (wallpaper: string | undefined) => WALLPAPERS[wallpaper ?? 'dusk'] ?? WALLPAPERS.dusk!;

export function useAppearance(appearance: Appearance | undefined) {
  const accent = appearance?.accent ?? 'violet';
  const reduceMotion = appearance?.reduceMotion ?? false;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = accent;
    if (reduceMotion) root.dataset.reduceMotion = 'true';
    else delete root.dataset.reduceMotion;
  }, [accent, reduceMotion]);
}
