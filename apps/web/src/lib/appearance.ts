// Applies the person's appearance (D-010, US-HOME-01, US-ACCT-32…35) on <html>: data-accent, data-theme ("solid"
// with Reduce transparency) and data-motion ("reduced" or "full"), and draws their wallpaper on the shell. What it
// sets is also kept in localStorage, so index.html's first script can set the same before the page first paints.
import type { AppRouter } from '@hlabs/api';
import type { inferRouterOutputs } from '@trpc/server';
import type { CSSProperties } from 'react';
import { useEffect, useSyncExternalStore } from 'react';

export type Appearance = inferRouterOutputs<AppRouter>['auth']['me']['appearance'];
export type Wallpaper = Appearance['wallpaper'];
export type Accent = Appearance['accent'];

export const WALLPAPER_IDS = ['dusk', 'ocean', 'forest'] as const satisfies readonly Wallpaper[];
export const ACCENT_IDS = ['violet', 'mint', 'amber', 'rose'] as const satisfies readonly Accent[];

/** Wallpaper id → the classes that draw it (packages/ui components.css). */
export const WALLPAPERS: Record<Wallpaper, string> = {
  dusk: 'hl-wall',
  ocean: 'hl-wall hl-wall-ocean',
  forest: 'hl-wall hl-wall-forest',
  custom: 'hl-wall hl-wall-custom',
};

/** The classes for a person's wallpaper: their photo only while they have one; anything unknown draws Dusk. */
export function wallpaperClass(appearance: Pick<Appearance, 'wallpaper' | 'customWallpaperUrl'> | undefined) {
  const id = appearance?.wallpaper ?? 'dusk';
  if (id === 'custom' && !appearance?.customWallpaperUrl) return WALLPAPERS.dusk;
  return WALLPAPERS[id] ?? WALLPAPERS.dusk;
}

/** The photo for `.hl-wall-custom`. */
export function wallpaperStyle(
  appearance: Pick<Appearance, 'wallpaper' | 'customWallpaperUrl'> | undefined,
): CSSProperties | undefined {
  if (appearance?.wallpaper !== 'custom' || !appearance.customWallpaperUrl) return undefined;
  return { '--hl-wall-image': `url("${appearance.customWallpaperUrl}")` } as CSSProperties;
}

/** localStorage key read by index.html's first script; keep the two in step. */
export const APPEARANCE_CACHE_KEY = 'hlabs.appearance';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeOs(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener?.('change', onChange);
  return () => query.removeEventListener?.('change', onChange);
}
const osReducesMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_QUERY).matches;

/** The device's own reduce-motion setting, live. */
export function useOsReducesMotion(): boolean {
  return useSyncExternalStore(subscribeOs, osReducesMotion, () => false);
}

/** Reduce motion as it applies here: the person's choice, or the device's setting while they've never made one. */
export const reducesMotion = (appearance: Pick<Appearance, 'reduceMotion'> | undefined, os: boolean) =>
  appearance?.reduceMotion ?? os;

/** What index.html's first script reads; `motion` null: never set, the device's setting decides. */
export interface AppearanceCache {
  accent: Accent;
  solid: boolean;
  motion: 'reduced' | 'full' | null;
}

function cache(value: AppearanceCache) {
  try {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(value));
  } catch {
    // Private browsing or storage turned off: the next load paints the default first.
  }
}

/**
 * Sets the person's accent, theme and motion on <html>. Until auth.me has answered (and signed out) it leaves what
 * index.html set from the cache: the last person's look on this device, else the defaults and the device's setting.
 */
export function useAppearance(appearance: Appearance | undefined) {
  const os = useOsReducesMotion();
  const accent = appearance?.accent;
  const solid = appearance?.reduceTransparency;
  const chosen = appearance?.reduceMotion;
  const reduced = appearance ? reducesMotion(appearance, os) : undefined;
  useEffect(() => {
    if (accent === undefined || solid === undefined || reduced === undefined) return;
    const root = document.documentElement;
    const motion = reduced ? 'reduced' : 'full';
    root.dataset.accent = accent;
    root.dataset.theme = solid ? 'solid' : 'glass';
    root.dataset.motion = motion;
    cache({ accent, solid, motion: chosen === null ? null : motion });
  }, [accent, solid, reduced, chosen]);
}
