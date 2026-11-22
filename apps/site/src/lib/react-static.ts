// The site has no React in the browser: @hlabs/icons' components (Lucide icons, AppLogo) are rendered to plain HTML
// when the site is built, so tiles and icons are the dashboard's own.
import * as icons from '@hlabs/icons';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

type IconComponent = ComponentType<{
  size?: number;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
  className?: string;
}>;

/** "key-round" or "KeyRound" → the Lucide component, or undefined. */
export function lucide(name: string): IconComponent | undefined {
  const pascal = name.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
  const found = (icons as unknown as Record<string, unknown>)[pascal];
  return typeof found === 'function' || (typeof found === 'object' && found !== null)
    ? (found as IconComponent)
    : undefined;
}

/** A Lucide icon as SVG markup, hidden from screen readers (stroke 2, like the dashboard). */
export function iconSvg(name: string, size = 20, strokeWidth = 2): string {
  const Icon = lucide(name);
  if (!Icon) throw new Error(`No Lucide icon called "${name}"`);
  return renderToStaticMarkup(createElement(Icon, { size, strokeWidth, 'aria-hidden': true }));
}

export interface TileInput {
  name: string;
  /** The logo's URL on this site, or null for the gradient and icon. */
  src: string | null;
  gradient: readonly [string, string] | null;
  fallback: string | null;
  size: number;
  /** The name is written beside it. */
  decorative?: boolean;
}

/** An app's tile, exactly as the dashboard draws it (AppLogo). */
export function appTileHtml(t: TileInput): string {
  const Fallback = lucide(t.fallback ?? 'box') ?? lucide('box')!;
  return renderToStaticMarkup(
    createElement(icons.AppLogo, {
      name: t.name,
      src: t.src,
      colors: t.gradient ?? undefined,
      size: t.size,
      decorative: t.decorative ?? true,
      className: 'tile',
      fallbackIcon: createElement(Fallback, { size: Math.round(t.size * 0.44), strokeWidth: 2, 'aria-hidden': true }),
    }),
  );
}
