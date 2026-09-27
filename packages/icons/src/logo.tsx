import { useId, type SVGProps } from 'react';
import { MARK_DOTS, MARK_HEIGHT, MARK_PATH, MARK_WIDTH, LOCKUP_WIDTH, WORDMARK_PATH, WORDMARK_X } from './paths';

/**
 * color       gradient mark for dark and glass surfaces (the product default)
 * on-light    deeper gradient for white or light backgrounds
 * white/ink   single colour
 * current     single colour in the surrounding text colour (menus, tray previews)
 */
export type LogoTone = 'color' | 'on-light' | 'white' | 'ink' | 'current';

const PALETTES = {
  color: { stops: ['#ff8a6b', '#8b6bff', '#2dd4bf'], dots: ['#ff8a6b', '#a78bfa', '#2dd4bf'], word: '#ffffff' },
  'on-light': { stops: ['#f0643f', '#6d4aff', '#0e9f99'], dots: ['#f0643f', '#6d4aff', '#0e9f99'], word: '#1b1433' },
} as const;
const SOLID = { white: '#ffffff', ink: '#1b1433', current: 'currentColor' } as const;

export interface LogoProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'height' | 'width'> {
  tone?: LogoTone;
  /** Height in px; width follows the aspect ratio. Default 24. */
  size?: number;
  /** Accessible name. Default "hlabs". Pass "" when a visible "hlabs" label sits next to it. */
  title?: string;
  /**
   * Drop the three dots and thicken the stroke so the mark stays crisp at small sizes.
   * Defaults to true at 20px and below (menu bar, tray, favicon, inline next to text).
   */
  simplified?: boolean;
}

const SMALL_MAX = 20;

function Shapes({ tone, gid, simplified }: { tone: LogoTone; gid: string; simplified?: boolean }) {
  const thick = simplified ? { strokeWidth: 8, strokeLinejoin: 'round' as const } : null;
  if (tone === 'color' || tone === 'on-light') {
    const p = PALETTES[tone];
    return (
      <>
        <defs>
          <linearGradient id={gid} x1="0" y1="163" x2="201" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={p.stops[0]} />
            <stop offset="0.5" stopColor={p.stops[1]} />
            <stop offset="1" stopColor={p.stops[2]} />
          </linearGradient>
        </defs>
        <path d={MARK_PATH} fill={`url(#${gid})`} {...(thick && { ...thick, stroke: `url(#${gid})` })} />
        {simplified
          ? null
          : MARK_DOTS.map((cx, i) => <circle key={cx} cx={cx} cy={125.5} r={9} fill={p.dots[i]} />)}
      </>
    );
  }
  const c = SOLID[tone];
  return (
    <>
      <path d={MARK_PATH} fill={c} {...(thick && { ...thick, stroke: c })} />
      {simplified ? null : MARK_DOTS.map((cx) => <circle key={cx} cx={cx} cy={125.5} r={9} fill={c} />)}
    </>
  );
}

function a11y(title: string) {
  return title ? { role: 'img' as const, 'aria-label': title } : { 'aria-hidden': true as const };
}

/** The hlabs mark: a lowercase h whose arch becomes a cloud. */
export function LogoMark({ tone = 'color', size = 24, title = 'hlabs', simplified, ...rest }: LogoProps) {
  const gid = `hl-logo-${useId().replace(/:/g, '')}`;
  const simple = simplified ?? size <= SMALL_MAX;
  const viewBox = simple ? `-4 -4 ${MARK_WIDTH + 8} ${MARK_HEIGHT + 8}` : `0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`;
  return (
    <svg width={(size * MARK_WIDTH) / MARK_HEIGHT} height={size} viewBox={viewBox} {...a11y(title)} {...rest}>
      {title ? <title>{title}</title> : null}
      <Shapes tone={tone} gid={gid} simplified={simple} />
    </svg>
  );
}

/** Mark plus the "hlabs" wordmark. For sign-in, the installer and About. */
export function LogoLockup({ tone = 'color', size = 32, title = 'hlabs', simplified: _s, ...rest }: LogoProps) {
  const gid = `hl-logo-${useId().replace(/:/g, '')}`;
  const word = tone === 'color' || tone === 'on-light' ? PALETTES[tone].word : SOLID[tone];
  return (
    <svg width={(size * LOCKUP_WIDTH) / MARK_HEIGHT} height={size} viewBox={`0 0 ${LOCKUP_WIDTH} ${MARK_HEIGHT}`} {...a11y(title)} {...rest}>
      {title ? <title>{title}</title> : null}
      <Shapes tone={tone} gid={gid} />
      <path transform={`translate(${WORDMARK_X} ${MARK_HEIGHT})`} d={WORDMARK_PATH} fill={word} />
    </svg>
  );
}
