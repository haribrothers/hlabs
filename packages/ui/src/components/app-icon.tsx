import { AppLogo } from '@hlabs/icons';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useUiStrings } from '../lib/strings';
import { SIZE_APP_ICON } from '../lib/tokens';

export type AppIconState = 'running' | 'installing' | 'stopped' | 'update' | 'error';

export interface AppIconProps {
  name: string;
  /** The app's logo from its manifest; the gradient shows while it loads or if it's missing. */
  src?: string | null;
  /** Fallback gradient, top-left → bottom-right. */
  colors?: readonly [string, string];
  /** White fallback icon on the gradient (a Lucide icon from @hlabs/icons). */
  icon?: ReactNode;
  state?: AppIconState;
  /** 0–100, shown as a ring while installing. */
  progress?: number;
  href?: string;
  /** Replaces the accessible name, e.g. "Open Jellyfin" on Home. */
  ariaLabel?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void;
}

const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;

/** An installed app on Home: logo tile, name, and its state on the tile. One button or link. */
export function AppIcon({
  name,
  src,
  colors,
  icon,
  state = 'running',
  progress = 0,
  href,
  ariaLabel: ariaLabelOverride,
  onClick,
  onContextMenu,
}: AppIconProps) {
  const t = useUiStrings();
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const badge = state === 'update' || state === 'error' || state === 'stopped' ? t.appState[state] : null;
  const label = state === 'installing' ? t.installing(pct) : name;
  const ariaLabel = ariaLabelOverride ?? (state === 'running' ? name : `${name}, ${(badge ?? label).toLowerCase()}`);
  const content = (
    <>
      {badge ? <span className={`hl-app-badge hl-app-badge-${state}`}>{badge}</span> : null}
      <span className="hl-app-icon">
        <AppLogo
          name={name}
          src={src}
          colors={colors}
          fallbackIcon={icon}
          size={SIZE_APP_ICON}
          className={cn(state === 'installing' && 'hl-app-dim')}
        />
        {state === 'installing' ? (
          <span className="hl-app-overlay">
            <svg width="46" height="46" viewBox="0 0 46 46" className="hl-app-ring" aria-hidden="true">
              <circle cx="23" cy="23" r={RING_R} fill="none" strokeWidth="4" className="hl-app-ring-track" />
              <circle
                cx="23"
                cy="23"
                r={RING_R}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                className="hl-app-ring-fill"
                strokeDasharray={`${((RING_C * pct) / 100).toFixed(1)} ${RING_C.toFixed(1)}`}
              />
            </svg>
          </span>
        ) : null}
      </span>
      <span className="hl-app-name">{label}</span>
    </>
  );
  const className = cn('hl-app', state === 'stopped' && 'hl-app-stopped');
  return href ? (
    <a href={href} className={className} aria-label={ariaLabel} onClick={onClick} onContextMenu={onContextMenu}>
      {content}
    </a>
  ) : (
    <button type="button" className={className} aria-label={ariaLabel} onClick={onClick} onContextMenu={onContextMenu}>
      {content}
    </button>
  );
}
