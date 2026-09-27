import { forwardRef, type SVGProps } from 'react';

export interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  /** Pixel size. Default 24 (the tab bar size). */
  size?: number | string;
  /** Accessible name. Omit for decorative use next to a visible label (the tab bar). */
  title?: string;
}

type Shape = { d: string; evenOdd?: boolean } | { rect: [number, number, number, number, number] } | { stroke: string; width: number };

function createGlyph(displayName: string, shapes: Shape[]) {
  const Glyph = forwardRef<SVGSVGElement, GlyphProps>(({ size = 24, title, ...rest }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {shapes.map((s, i) =>
        'rect' in s ? (
          <rect key={i} x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]} rx={s.rect[4]} />
        ) : 'stroke' in s ? (
          <path key={i} d={s.stroke} fill="none" stroke="currentColor" strokeWidth={s.width} strokeLinecap="round" />
        ) : (
          <path key={i} d={s.d} fillRule={s.evenOdd ? 'evenodd' : undefined} />
        ),
      )}
    </svg>
  ));
  Glyph.displayName = displayName;
  return Glyph;
}

/* Filled 24px glyphs for the tab bar. Always filled, selected or not:
   the glass lens and accent-tab colour show the selected tab. */

export const TabHome = createGlyph('TabHome', [
  { d: 'M11.3 3.3a1 1 0 0 1 1.4 0l8.6 7.7a1 1 0 0 1-1.3 1.5l-.5-.4V20a1.5 1.5 0 0 1-1.5 1.5H15v-5.2a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.2H6A1.5 1.5 0 0 1 4.5 20v-7.9l-.5.4A1 1 0 0 1 2.7 11z' },
]);

export const TabStore = createGlyph('TabStore', [
  { rect: [3.5, 3.5, 7.5, 7.5, 2.2] },
  { rect: [13, 3.5, 7.5, 7.5, 2.2] },
  { rect: [3.5, 13, 7.5, 7.5, 2.2] },
  { stroke: 'M16.75 13.8v6.4M13.55 17h6.4', width: 2.2 },
]);

export const TabFiles = createGlyph('TabFiles', [
  { d: 'M3 7a2.5 2.5 0 0 1 2.5-2.5h3.9c.7 0 1.3.3 1.8.8l1.3 1.5h6A2.5 2.5 0 0 1 21 9.3v8.2a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z' },
]);

export const TabUsage = createGlyph('TabUsage', [
  { rect: [3, 11, 4.6, 9.5, 1.6] },
  { rect: [9.7, 3.5, 4.6, 17, 1.6] },
  { rect: [16.4, 13.5, 4.6, 7, 1.6] },
]);

export const TabBackups = createGlyph('TabBackups', [
  { d: 'M12 2.8a9.2 9.2 0 1 1 0 18.4 9.2 9.2 0 0 1 0-18.4zm-.9 4.7a.9.9 0 0 1 1.8 0v4.1l2.8 1.7a.9.9 0 1 1-.9 1.5l-3.2-1.9a.9.9 0 0 1-.5-.8z', evenOdd: true },
]);

export const TabSettings = createGlyph('TabSettings', [
  { d: 'M10.3 2.5h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8a7 7 0 0 1 0 2l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6a7 7 0 0 1-1.7-.9l-2.5.9-1.7-2.9 2-1.8a7 7 0 0 1 0-2l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', evenOdd: true },
]);

export const TabSearch = createGlyph('TabSearch', [
  { d: 'M10.5 3a7.5 7.5 0 0 1 6 12l4.3 4.3a1.3 1.3 0 0 1-1.8 1.8L14.7 16.8A7.5 7.5 0 1 1 10.5 3zm0 2.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10z', evenOdd: true },
]);

/** The six tab-bar areas plus search, keyed by route id. */
export const tabGlyphs = {
  home: TabHome,
  store: TabStore,
  files: TabFiles,
  usage: TabUsage,
  backups: TabBackups,
  settings: TabSettings,
  search: TabSearch,
} as const;

export type TabId = keyof typeof tabGlyphs;
