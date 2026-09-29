// Store cards (US-STORE-01), as the AppStore screen draws them: the featured card tinted with the app's colours, and
// the flat card in a row. The card body opens the app's details; its one button installs (by way of the details page,
// so access is always seen first), opens or shows install progress. Install is white on every card, as the screen
// shows (D-077); Open and progress are glass.
import type { StoreApp } from '@hlabs/api';
import { AppLogo, appTileLook } from '@hlabs/icons';
import { Badge, Button, cn, tokens } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { storeCopy } from '../copy/store';
import { browser } from '../lib/browser';
import { cardAction, storeTags, type StoreHost } from './store-app';
import type { Installs } from './use-installs';

export interface CardProps {
  app: StoreApp;
  host: StoreHost;
  installs: Installs;
}

export const detailsPath = (appId: string) => ({ to: '/store/app/$appId', params: { appId } }) as const;

export function StoreLogo({ app, size }: { app: StoreApp; size: number }) {
  const look = appTileLook(app.name, app.icon, size);
  return (
    <AppLogo
      name={app.name}
      src={app.icon.logoUrl}
      colors={look.colors}
      fallbackIcon={look.fallbackIcon}
      size={size}
      style={{ boxShadow: 'var(--shadow-icon)' }}
    />
  );
}

/** The featured card's logo: a step up from Home's tile (88 px). */
const FEATURED_LOGO = tokens.SIZE_APP_ICON + tokens.SPACE_3;

/** Install, Open, Installing… N% or Installed (US-STORE-01). */
export function CardButton({ app, installs, size = 'sm' }: Omit<CardProps, 'host'> & { size?: 'sm' | 'md' }) {
  const action = cardAction(app, installs.byId.get(app.id), installs.progress.get(app.id));
  // Above the card's stretched link, so it gets its own clicks.
  const place = 'relative z-10 shrink-0';
  switch (action.kind) {
    case 'install':
      return (
        <Link
          {...detailsPath(app.id)}
          className={cn('hl-btn hl-btn-primary hl-focus no-underline', `hl-btn-${size}`, place)}
          aria-label={storeCopy.installApp(app.name)}
        >
          {storeCopy.install}
        </Link>
      );
    case 'open':
      return (
        <Button
          variant="secondary"
          size={size}
          className={place}
          aria-label={storeCopy.openApp(app.name)}
          onClick={() => browser.open(action.url)}
        >
          {storeCopy.open}
        </Button>
      );
    case 'installing':
      return (
        <Button variant="secondary" size={size} className={place} busy disabled aria-live="polite">
          {storeCopy.installing(action.percent)}
        </Button>
      );
    case 'installed':
      return (
        <Badge tone="success" className={place}>
          {storeCopy.installed}
        </Badge>
      );
  }
}

/** The name as a link whose hit area covers the whole card (the button sits above it). */
function NameLink({ app, className }: { app: StoreApp; className?: string }) {
  return (
    <Link
      {...detailsPath(app.id)}
      className={cn(
        'hl-focus rounded-xs text-ink no-underline after:absolute after:inset-0 after:content-[""]',
        className,
      )}
    >
      {app.name}
    </Link>
  );
}

/** Platform and topic tags: small dark chips on the tinted card. */
function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-pill bg-[color-mix(in_srgb,var(--wall-base)_45%,transparent)] px-3 py-1 text-caption font-semibold text-ink"
        >
          {t}
        </span>
      ))}
    </span>
  );
}

/** A large card in "Featured", tinted with the app's colours. */
export function FeaturedCard({ app, host, installs, eyebrow }: CardProps & { eyebrow: string }) {
  const [from, to] = app.icon.gradient ?? appTileLook(app.name, app.icon).colors;
  const tint = { '--card-from': from, '--card-to': to } as CSSProperties;
  return (
    <div
      className="relative flex h-full flex-row items-start gap-6 overflow-hidden rounded-xl border border-glass p-6 [background-image:linear-gradient(135deg,color-mix(in_srgb,var(--card-from)_48%,transparent),color-mix(in_srgb,var(--card-to)_30%,transparent))]"
      style={tint}
    >
      <StoreLogo app={app} size={FEATURED_LOGO} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-caption font-bold uppercase tracking-widest text-ink-muted">{eyebrow}</span>
        <h3 className="m-0 text-title-1 font-bold">
          <NameLink app={app} />
        </h3>
        <p className="m-0 text-body text-ink-muted">{app.tagline}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <CardButton app={app} installs={installs} size="md" />
          <Tags tags={storeTags(app, host)} />
        </div>
      </div>
    </div>
  );
}

/** A card in a row of the store home or a list view: flat, on the window's row surface. */
export function AppCard({ app, installs }: CardProps) {
  return (
    <div className="relative flex h-full flex-row items-center gap-4 rounded-lg bg-surface-row p-4">
      <StoreLogo app={app} size={tokens.SIZE_DOCK_TILE} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <NameLink app={app} className="text-headline font-bold" />
        <span className="line-clamp-2 text-label text-ink-muted">{app.tagline}</span>
      </div>
      <CardButton app={app} installs={installs} />
    </div>
  );
}
