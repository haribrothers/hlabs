import { useState, type CSSProperties, type ReactNode } from 'react';
import { Box } from 'lucide-react';

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
}

/**
 * An app's tile: its own logo when there is one, otherwise a gradient with a white icon.
 * The gradient also shows behind the logo while it loads.
 */
export function AppLogo({ name, src, colors, fallbackIcon, size = 76, radius, className, style }: AppLogoProps) {
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
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSrc(src ?? null)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span role="img" aria-label={name} style={{ display: 'flex' }}>
          {fallbackIcon ?? <Box size={Math.round(size * 0.44)} strokeWidth={2} aria-hidden />}
        </span>
      )}
    </span>
  );
}
