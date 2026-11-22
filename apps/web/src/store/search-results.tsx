// Search results as the StoreSearch screen draws them (US-STORE-03, with US-STORE-05's layout): "Results for “q”", chips
// "All · N", "Installed · N" and (on arm64) "Apple Silicon only", then one list: logo, name, "tagline · category", and
// "Installed" with Open or a white Install. The daemon filters and counts (US-STORE-05); one character asks for nothing.
// "Can't find an app? Add another app source" joins with app sources (phase 7, D-036).
import type { StoreApp } from '@hlabs/api';
import { isFeatureEnabled, VISIBLE_PHASE } from '@hlabs/shared';
import { Badge, Button, cn, tokens } from '@hlabs/ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { categoryLabels, storeCopy } from '../copy/store';
import { browser } from '../lib/browser';
import { useMe } from '../lib/use-me';
import { MoreOnScroll, useAppPages } from './app-pages';
import { detailsPath, StoreLogo } from './cards';
import { cardAction, type StoreHost } from './store-app';
import { StoreView } from './store-layout';
import { useInstalls, type Installs } from './use-installs';

const copy = storeCopy;
/** The row's logo, a little smaller than a row card's (52 px, as the screen draws it). */
const ROW_LOGO = tokens.SIZE_DOCK_TILE - tokens.SPACE_1;

const chip = (on: boolean) =>
  cn(
    'hl-focus inline-flex min-h-9 items-center rounded-pill px-4 text-body-sm',
    on ? 'bg-fill-primary font-semibold text-ink-on-light' : 'bg-surface-row text-ink',
  );

function ResultRow({ app, installs }: { app: StoreApp; installs: Installs }) {
  const action = cardAction(app, installs.byId.get(app.id), installs.progress.get(app.id));
  return (
    <li className="relative flex items-center gap-4 border-b border-hairline px-5 py-4 last:border-b-0">
      <StoreLogo app={app} size={ROW_LOGO} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          {...detailsPath(app.id)}
          className="hl-focus self-start rounded-xs text-headline font-bold text-ink no-underline after:absolute after:inset-0 after:content-['']"
        >
          {app.name}
        </Link>
        <span className="line-clamp-2 text-body-sm text-ink-muted md:line-clamp-1">
          {app.tagline} · {categoryLabels[app.group]}
        </span>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-3">
        {action.kind === 'open' || action.kind === 'installed' ? <Badge tone="success">{copy.installed}</Badge> : null}
        {action.kind === 'open' ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={copy.openApp(app.name)}
            onClick={() => browser.open(action.url)}
          >
            {copy.open}
          </Button>
        ) : action.kind === 'installing' ? (
          <Button variant="secondary" size="sm" busy disabled>
            {copy.installing(action.percent)}
          </Button>
        ) : action.kind === 'install' ? (
          <Link
            {...detailsPath(app.id)}
            className="hl-btn hl-btn-primary hl-btn-sm hl-focus no-underline"
            aria-label={copy.installApp(app.name)}
          >
            {copy.install}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function SearchResults({ query, shippedPhase = VISIBLE_PHASE }: { query: string; shippedPhase?: number }) {
  const isAdmin = useMe().data?.role === 'admin';
  const [installedOnly, setInstalledOnly] = useState(false);
  const [arm64Only, setArm64Only] = useState(false);
  // One character finds too much to be useful: nothing is asked for (US-STORE-05).
  const searching = query.length > 1;
  const { query: pages, first, items } = useAppPages({ query, installedOnly, arm64Only }, searching);
  const installs = useInstalls();
  const title = copy.resultsFor(query);
  if (!searching || !first) return <StoreView title={title}>{null}</StoreView>;

  const host: StoreHost = first.host;
  const { all, installed } = first.counts;

  return (
    <StoreView title={title}>
      <div className="flex flex-col gap-5 pb-6">
        {all || installedOnly || arm64Only ? (
          <div role="group" aria-label={copy.filters} className="flex flex-wrap gap-2">
            <button
              type="button"
              className={chip(!installedOnly)}
              aria-pressed={!installedOnly}
              onClick={() => setInstalledOnly(false)}
            >
              {copy.filterAll(all)}
            </button>
            <button
              type="button"
              className={chip(installedOnly)}
              aria-pressed={installedOnly}
              onClick={() => setInstalledOnly(true)}
            >
              {copy.filterInstalled(installed)}
            </button>
            {host.arm64 ? (
              <button
                type="button"
                className={chip(arm64Only)}
                aria-pressed={arm64Only}
                onClick={() => setArm64Only((v) => !v)}
              >
                {copy.filterArm64[host.os]}
              </button>
            ) : null}
          </div>
        ) : null}
        {items.length ? (
          <ul aria-label={title} className="m-0 list-none overflow-hidden rounded-xl bg-surface-row p-0">
            {items.map((app) => (
              <ResultRow key={app.id} app={app} installs={installs} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-body text-ink-muted">{copy.noResults(query)}</p>
        )}
        <MoreOnScroll query={pages} />
        {isAdmin && isFeatureEnabled('storeSources', shippedPhase) ? (
          <p className="m-0 text-body-sm text-ink-muted">
            {copy.cantFind}{' '}
            <a href="/store/sources" className="hl-focus rounded-xs font-bold text-accent no-underline">
              {copy.addSource}
            </a>
          </p>
        ) : null}
      </div>
    </StoreView>
  );
}
