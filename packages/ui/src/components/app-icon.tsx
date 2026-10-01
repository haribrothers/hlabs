import { AppLogo } from '@hlabs/icons';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useUiStrings } from '../lib/strings';
import { SIZE_APP_ICON } from '../lib/tokens';

/**
 * How a tile looks (US-HOME-06): `running` is the logo and name; `installing` and `updating` a ring over the dimmed
 * logo; `busy` (starting, restarting, stopping, rolling back, removing) the dimmed logo with `status` for its name;
 * `stopped` desaturated at half opacity; `update` and `error` a badge.
 */
export type AppIconState = 'running' | 'installing' | 'updating' | 'busy' | 'stopped' | 'update' | 'error';

export interface AppIconProps {
  name: string;
  /** The app's logo from its manifest; the gradient shows while it loads or if it's missing. */
  src?: string | null;
  /** Fallback gradient, top-left → bottom-right. */
  colors?: readonly [string, string];
  /** White fallback icon on the gradient (a Lucide icon from @hlabs/icons). */
  icon?: ReactNode;
  state?: AppIconState;
  /** 0–100, shown as a ring while installing or updating; without it an update's ring turns. */
  progress?: number;
  /** What a `busy` tile says in place of its name: "Starting…", "Removing…". */
  status?: string;
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
  progress,
  status,
  href,
  ariaLabel: ariaLabelOverride,
  onClick,
  onContextMenu,
}: AppIconProps) {
  const t = useUiStrings();
  const pct = Math.max(0, Math.min(100, Math.round(progress ?? 0)));
  const ring = state === 'installing' || state === 'updating';
  const badge = state === 'update' || state === 'error' || state === 'stopped' ? t.appState[state] : null;
  const label =
    state === 'installing'
      ? t.installing(pct)
      : state === 'updating'
        ? t.updating
        : state === 'busy'
          ? (status ?? name)
          : name;
  // "Nextcloud, installing, 64%", "Pi-hole, stopped", "Vaultwarden, restarting".
  const said = (text: string) => text.replace(/…/g, '').toLowerCase();
  const stateWords =
    state === 'installing'
      ? `${said(t.installing(pct).replace(/\s*\d+%$/, ''))}, ${pct}%`
      : badge
        ? said(badge)
        : state === 'running'
          ? null
          : said(label);
  const ariaLabel = ariaLabelOverride ?? (stateWords ? `${name}, ${stateWords}` : name);
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
          // The tile already says the name.
          decorative
          className={cn((ring || state === 'busy') && 'hl-app-dim')}
        />
        {ring ? (
          <span className="hl-app-overlay">
            <svg
              width="46"
              height="46"
              viewBox="0 0 46 46"
              className={cn('hl-app-ring', progress === undefined && state === 'updating' && 'hl-app-ring-turning')}
              aria-hidden="true"
            >
              <circle cx="23" cy="23" r={RING_R} fill="none" strokeWidth="4" className="hl-app-ring-track" />
              <circle
                cx="23"
                cy="23"
                r={RING_R}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                className="hl-app-ring-fill"
                strokeDasharray={
                  progress === undefined && state === 'updating'
                    ? `${(RING_C / 4).toFixed(1)} ${RING_C.toFixed(1)}`
                    : `${((RING_C * pct) / 100).toFixed(1)} ${RING_C.toFixed(1)}`
                }
              />
            </svg>
          </span>
        ) : null}
      </span>
      <span className={cn('hl-app-name', label !== name && 'hl-app-status')}>{label}</span>
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
