// App details (US-STORE-06): the app, its screenshots, what it is and does, the facts (version, what runs, where it
// opens, what it needs), and the view's one white button: Install (the install sheet, US-STORE-08) or Open.
import type { StoreAppDetails } from '@hlabs/api';
import { ChevronLeft, ChevronRight, iconDefaults } from '@hlabs/icons';
import { Badge, Button, GlassCard, ModalDialog, tokens } from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { categoryLabels, storeCopy } from '../copy/store';
import { browser } from '../lib/browser';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';
import { StoreLogo } from './cards';
import { cardAction, storeTags } from './store-app';
import { pageScroller, storeReturnHref } from './store-return';
import { useInstalls } from './use-installs';

const copy = storeCopy;
const Readme = lazy(() => import('./readme'));

export function useAppDetails(appId: string) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.store.getApp.queryOptions({ appId }), retry: false, ...pageQuery });
}

/** Manifest text as paragraphs: blank lines separate them, single line breaks (YAML wrapping) don't. */
export function paragraphs(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** "3 containers · server, database, cache" (roles, or the service's own name). */
export function runsAs(services: StoreAppDetails['services']): string {
  return copy.containers(
    services.length,
    services.map((s) => (s.role ? copy.roles[s.role] : s.name)),
  );
}

function PrimaryAction({ details, onInstall }: { details: StoreAppDetails; onInstall: () => void }) {
  const installs = useInstalls();
  const { app, host } = details;
  const action = cardAction(app, installs.byId.get(app.id), installs.progress.get(app.id));
  const noPlatform = host.arm64 && !app.arm64;
  switch (action.kind) {
    case 'open':
      return (
        <Button size="lg" onClick={() => browser.open(action.url)}>
          {copy.open}
        </Button>
      );
    case 'installing':
      return (
        <Button size="lg" busy disabled>
          {copy.installing(action.percent)}
        </Button>
      );
    case 'installed':
      return <Badge tone="success">{copy.installed}</Badge>;
    case 'install':
      return (
        <Button size="lg" disabled={noPlatform} onClick={onInstall}>
          {copy.install}
        </Button>
      );
  }
}

/** Up to 5 screenshots at 16:10; one opens a viewer that arrow keys move through and Escape closes. */
function Screenshots({ urls, name }: { urls: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (urls.length === 0) return null;
  const move = (step: number) => setOpen((i) => (i === null ? i : (i + step + urls.length) % urls.length));
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') move(1);
    else if (e.key === 'ArrowLeft') move(-1);
    else return;
    e.preventDefault();
  };
  return (
    <section aria-label={copy.screenshots}>
      <ul className="m-0 flex list-none gap-4 overflow-x-auto p-0">
        {urls.map((url, i) => (
          <li key={url} className="w-80 max-w-[80%] shrink-0">
            <button
              type="button"
              className="hl-focus block w-full overflow-hidden rounded-lg border border-hairline bg-surface-control p-0"
              aria-label={copy.openScreenshot(i + 1)}
              onClick={() => setOpen(i)}
            >
              <img src={url} alt="" className="block aspect-[16/10] w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <ModalDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open === null ? name : copy.screenshotN(open + 1, urls.length)}
        width="min(90vw, 1100px)"
        actions={
          <Button variant="secondary" onClick={() => setOpen(null)}>
            {copy.close}
          </Button>
        }
      >
        {open !== null ? (
          <div className="flex items-center gap-3" onKeyDown={onKeyDown}>
            <Button variant="secondary" size="sm" aria-label={copy.previous} onClick={() => move(-1)}>
              <ChevronLeft aria-hidden {...iconDefaults} />
            </Button>
            <img
              src={urls[open]}
              alt={copy.screenshotN(open + 1, urls.length)}
              className="aspect-[16/10] min-w-0 flex-1 rounded-md object-contain"
            />
            <Button variant="secondary" size="sm" aria-label={copy.next} onClick={() => move(1)}>
              <ChevronRight aria-hidden {...iconDefaults} />
            </Button>
          </div>
        ) : null}
      </ModalDialog>
    </section>
  );
}

/** Release notes, collapsed after 6 lines with "More". */
function WhatsNew({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const text = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = text.current;
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [notes, expanded]);
  return (
    <section aria-labelledby="details-whats-new" className="flex flex-col gap-2">
      <h2 id="details-whats-new" className="m-0 text-title-2">
        {copy.whatsNew}
      </h2>
      <p ref={text} className={`m-0 whitespace-pre-line text-body text-ink-muted ${expanded ? '' : 'line-clamp-6'}`}>
        {notes}
      </p>
      {overflows || expanded ? (
        <Button variant="link" className="self-start" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          {expanded ? copy.less : copy.more}
        </Button>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-row px-4 py-3">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="m-0 text-body-sm font-semibold">{value}</dd>
    </div>
  );
}

export function AppDetails({ appId }: { appId: string }) {
  const details = useAppDetails(appId);
  const navigate = useNavigate();
  // Details opens at its top, wherever the list was scrolled to.
  useLayoutEffect(() => {
    const page = pageScroller();
    if (page) page.scrollTop = 0;
  }, [appId]);
  useEffect(() => {
    if (details.data) document.title = `${details.data.app.name} · ${copy.docTitle}`;
  }, [details.data]);
  if (!details.data) return null;
  const d = details.data;
  const { app, host } = d;
  const tags = [categoryLabels[app.group], ...storeTags(app, host)];
  const noPlatform = host.arm64 && !app.arm64;
  const onInstall = () => void navigate({ to: '/store/app/$appId', params: { appId }, search: { install: true } });

  return (
    <GlassCard level={2} className="mx-auto flex w-full max-w-window flex-col gap-6 p-6 md:p-10">
      <Link
        to={storeReturnHref()}
        className="hl-focus inline-flex items-center gap-1 self-start rounded-xs text-body-sm text-ink-muted no-underline hover:text-ink"
      >
        <ChevronLeft aria-hidden {...iconDefaults} className="size-4" />
        {copy.title}
      </Link>

      <header className="flex flex-col gap-5 md:flex-row md:items-center">
        <StoreLogo app={app} size={tokens.SIZE_APP_ICON} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="m-0 text-display">{app.name}</h1>
          <p className="m-0 text-body text-ink-muted">{app.tagline}</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            <Badge tone={d.source.official ? 'accent' : 'neutral'}>
              {d.source.official ? copy.officialSource : d.source.name}
            </Badge>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <PrimaryAction details={d} onInstall={onInstall} />
          {noPlatform ? <p className="m-0 max-w-xs text-body-sm text-ink-muted">{copy.noArm64[host.os]}</p> : null}
        </div>
      </header>

      <Screenshots urls={d.screenshots} name={app.name} />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="details-about" className="flex flex-col gap-2">
            <h2 id="details-about" className="m-0 text-title-2">
              {copy.about}
            </h2>
            {d.readme ? (
              <Suspense fallback={null}>
                <Readme markdown={d.readme} />
              </Suspense>
            ) : (
              paragraphs(d.description).map((p) => (
                <p key={p} className="m-0 text-body text-ink-muted">
                  {p}
                </p>
              ))
            )}
          </section>
          {d.releaseNotes ? <WhatsNew notes={d.releaseNotes.trim()} /> : null}
        </div>
        <dl aria-label={copy.facts} className="m-0 flex flex-col gap-2">
          <Fact label={copy.version} value={d.version} />
          {d.services.length ? <Fact label={copy.runsAs} value={runsAs(d.services)} /> : null}
          <Fact label={copy.opensAt} value={d.address} />
          {d.folders.length ? <Fact label={copy.needsAccess} value={d.folders.map((f) => f.label).join(', ')} /> : null}
        </dl>
      </div>
    </GlassCard>
  );
}
