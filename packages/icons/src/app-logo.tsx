import { useState, type CSSProperties, type ReactNode } from 'react';
import { Box } from 'lucide-react';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';

/** Two-stop fallback gradients, picked by app name when the manifest gives none. */
export const FALLBACK_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ['#8b5cf6', '#4c1d95'],
  ['#fb923c', '#c2410c'],
  ['#38bdf8', '#0369a1'],
  ['#2dd4bf', '#0f766e'],
  ['#f472b6', '#9d174d'],
  ['#facc15', '#a16207'],
  ['#4ade80', '#15803d'],
  ['#f87171', '#b91c1c'],
];

/** Stable gradient for a name: same app, same colours, on every device. */
export function gradientFor(name: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_GRADIENTS[h % FALLBACK_GRADIENTS.length]!;
}

/**
 * A manifest logo is drawn at this share of its tile, centred on the app's gradient, so it has room inside the box
 * as the designs' glyphs do (the fallback glyph is 0.44 of the tile).
 */
export const LOGO_SCALE = 0.62;

export interface AppLogoProps {
  /** App name; used for the alt text and to pick a fallback gradient. */
  name: string;
  /** The logo URL from the app's manifest (square PNG/SVG, at least 256px). */
  src?: string | null;
  /** Fallback gradient from the manifest; otherwise picked from the name. */
  colors?: readonly [string, string];
  /** Fallback icon (a Lucide component element), shown in white on the gradient. Default: Box. */
  fallbackIcon?: ReactNode;
  /** Tile size in px. Home 76, Store cards 56, phone 60, lists 40. Default 76. */
  size?: number;
  /** Corner radius; defaults to size × 0.29 (22px at 76, radius-icon). */
  radius?: number;
  className?: string;
  style?: CSSProperties;
  /** The name is written beside it (a Home tile, a window title): the logo is then hidden from screen readers. */
  decorative?: boolean;
}

/**
 * An app's tile: the app's gradient with its own logo inset on it, or a white icon when it has no logo (or it fails).
 */
export function AppLogo({
  name,
  src,
  colors,
  fallbackIcon,
  size = 76,
  radius,
  className,
  style,
  decorative = false,
}: AppLogoProps) {
  // Remember which src failed, so a new src gets a fresh attempt without an effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc !== null && failedSrc === src;
  const [c1, c2] = colors ?? gradientFor(name);
  const showImg = Boolean(src) && !failed;
  return (
    <span
      className={className}
      data-state={showImg ? 'logo' : 'fallback'}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        overflow: 'hidden',
        borderRadius: radius ?? Math.round(size * 0.29),
        background: `linear-gradient(160deg, ${c1}, ${c2})`,
        color: '#ffffff',
        ...style,
      }}
    >
      {showImg ? (
        <img
          src={src ?? undefined}
          alt={decorative ? '' : name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src ?? null)}
          style={{ width: `${LOGO_SCALE * 100}%`, height: `${LOGO_SCALE * 100}%`, objectFit: 'contain' }}
        />
      ) : (
        <span
          {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
          style={{ display: 'flex' }}
        >
          {fallbackIcon ?? <Box size={Math.round(size * 0.44)} strokeWidth={2} aria-hidden />}
        </span>
      )}
    </span>
  );
}

/** The tile when an app has neither a logo gradient nor a fallback icon: neutral, with the name's first letter. */
export const NEUTRAL_GRADIENT: readonly [string, string] = ['#64748b', '#334155'];

const ICON_NAMES = new Set<string>(iconNames);

/** A Lucide icon by its kebab-case name (a manifest's `icon.fallback`), loaded on demand; Box until it arrives. */
export function AppGlyph({ name, size }: { name: string; size: number }) {
  const box = <Box size={size} strokeWidth={2} aria-hidden />;
  if (!ICON_NAMES.has(name)) return box;
  return <DynamicIcon name={name as IconName} size={size} strokeWidth={2} aria-hidden fallback={() => box} />;
}

/**
 * How an app's fallback tile looks (US-HOME-03): the manifest gradient and glyph; without a glyph, the name's first
 * letter; without either, the neutral gradient and the letter.
 */
export function appTileLook(
  name: string,
  icon: { gradient: readonly [string, string] | null; fallback: string | null },
  size = 76,
): { colors: readonly [string, string]; fallbackIcon: ReactNode } {
  const glyph = Math.round(size * 0.44);
  return {
    colors: icon.gradient ?? (icon.fallback ? gradientFor(name) : NEUTRAL_GRADIENT),
    fallbackIcon: icon.fallback ? (
      <AppGlyph name={icon.fallback} size={glyph} />
    ) : (
      <span aria-hidden style={{ fontSize: glyph, fontWeight: 700, lineHeight: 1 }}>
        {name.charAt(0).toUpperCase()}
      </span>
    ),
  };
}
