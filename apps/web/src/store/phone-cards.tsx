// PhoneStore's pieces (US-PHONE-10, D-172): an app as a list row (logo, name, tagline and one pill: Install, Open or
// what it's doing), the Featured card you swipe sideways, and the Updates row.
import type { StoreApp } from '@hlabs/api';
import { appTileLook, ArrowDown, iconDefaults } from '@hlabs/icons';
import { InsetRowContent, insetRowClass, PillButton, tokens } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { appsCopy } from '../copy/apps';
import { storeCopy } from '../copy/store';
import { browser } from '../lib/browser';
import { detailsPath, StoreLogo, type CardProps } from './cards';
import type { InstalledApp } from './store-app';
import { storeTags } from './store-app';
import type { Installs } from './use-installs';

const copy = storeCopy;
/** The row's logo (56px) and the featured card's (64px). */
const ROW_LOGO = tokens.SIZE_LIST_ICON;
const FEATURED_LOGO = tokens.SIZE_APP_ICON_PHONE + tokens.SPACE_1;

export type PhoneRowAction =
  { kind: 'install' } | { kind: 'open'; url: string } | { kind: 'busy'; label: string } | { kind: 'installed' };

/**
 * The row's one button (US-PHONE-10): "Install" when it isn't installed (or its install failed), "Open" when it's
 * installed and running, and what it's doing otherwise ("Installing… 42%", "Updating…", "Stopped").
 */
export function phoneRowAction(
  app: StoreApp,
  installed: InstalledApp | undefined,
  progress: number | undefined,
  location: Pick<Location, 'hostname'> = window.location,
): PhoneRowAction {
  if (!installed) return app.installed ? { kind: 'installed' } : { kind: 'install' };
  if (installed.state === 'install_failed') return { kind: 'install' };
  if (installed.state === 'installing') return { kind: 'busy', label: copy.installing(Math.round(progress ?? 0)) };
  if (installed.state !== 'running') return { kind: 'busy', label: appsCopy.status[installed.state] };
  const url =
    location.hostname.endsWith('.ts.net') && installed.urls.tailnet ? installed.urls.tailnet : installed.urls.local;
  return { kind: 'open', url };
}

function RowButton({ app, installs }: { app: StoreApp; installs: Installs }) {
  const action = phoneRowAction(app, installs.byId.get(app.id), installs.progress.get(app.id));
  switch (action.kind) {
    case 'install':
      // The details page with the install sheet open: what it can access is right behind the sheet (D-077).
      return (
        <Link
          {...detailsPath(app.id)}
          search={installs.byId.has(app.id) ? {} : { install: true }}
          className="hl-p-get hl-focus"
          aria-label={copy.installApp(app.name)}
        >
          <span>{copy.install}</span>
        </Link>
      );
    case 'open':
      return (
        <PillButton aria-label={copy.openApp(app.name)} onClick={() => browser.open(action.url)}>
          {copy.open}
        </PillButton>
      );
    case 'busy':
      return (
        <PillButton disabled aria-live="polite">
          {action.label}
        </PillButton>
      );
    case 'installed':
      return <span className="text-footnote text-ink-muted">{copy.installed}</span>;
  }
}

/** An app in a phone list: the logo, the name and tagline (to its details) and one pill. */
export function PhoneAppRow({ app, installs }: { app: StoreApp; installs: Installs }) {
  return (
    <div className="hl-p-li">
      <StoreLogo app={app} size={ROW_LOGO} />
      <div className="hl-p-li-body">
        <Link {...detailsPath(app.id)} className="hl-p-li-text hl-focus" aria-label={app.name}>
          <b>{app.name}</b>
          <span>{app.tagline}</span>
        </Link>
        <RowButton app={app} installs={installs} />
      </div>
    </div>
  );
}

/** A list of apps as rows. */
export function PhoneAppList({ apps, installs, label }: { apps: StoreApp[]; installs: Installs; label: string }) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col p-0">
      {apps.map((app) => (
        <li key={app.id}>
          <PhoneAppRow app={app} installs={installs} />
        </li>
      ))}
    </ul>
  );
}

/**
 * A Featured card (PhoneRedesignA_Store): a band in the app's colours with its logo over the edge, what it is
 * ("Photos · hlabs official"), the name, the tagline and "View". The card and "View" open its details.
 */
export function PhoneFeaturedCard({ app, host }: Omit<CardProps, 'installs'>) {
  const [from, to] = app.icon.gradient ?? appTileLook(app.name, app.icon).colors;
  const tint = { '--card-from': from, '--card-to': to } as CSSProperties;
  const eyebrow = storeTags(app, host).slice(0, 2).join(' · ');
  return (
    <div className="hl-p-featured" style={tint}>
      <span aria-hidden className="hl-p-featured-band">
        <span className="hl-p-featured-logo">
          <StoreLogo app={app} size={FEATURED_LOGO} />
        </span>
      </span>
      <span className="hl-p-featured-body">
        {eyebrow ? <span className="text-caption font-semibold text-ink-muted">{eyebrow}</span> : null}
        <Link
          {...detailsPath(app.id)}
          className="hl-focus rounded-xs text-title-2 font-bold text-ink no-underline after:absolute after:inset-0 after:content-['']"
        >
          {app.name}
        </Link>
        <span className="flex items-end justify-between gap-3">
          <span className="text-subhead text-ink-muted">{app.tagline}</span>
          <Link
            {...detailsPath(app.id)}
            aria-label={copy.viewApp(app.name)}
            className="hl-p-get hl-focus relative z-10"
          >
            <span>{copy.view}</span>
          </Link>
        </span>
      </span>
    </div>
  );
}

/** "Updates" with its count, above the sections (admins with updates waiting, US-PHONE-10). */
export function PhoneUpdatesRow({ count }: { count: number }) {
  return (
    <div className="hl-p-group">
      <Link to="/store/updates" className={insetRowClass()} aria-label={copy.updatesCount(count)}>
        <InsetRowContent
          icon={<ArrowDown aria-hidden {...iconDefaults} />}
          tone="store"
          title={copy.updates}
          trailing={
            <span aria-hidden className="hl-p-badge">
              {count}
            </span>
          }
          chevron
        />
      </Link>
    </div>
  );
}
