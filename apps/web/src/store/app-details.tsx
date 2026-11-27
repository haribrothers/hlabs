// App details (US-STORE-06): the app, its screenshots, what it is and does, the facts (version, what runs, where it
// opens, what it needs, its source and whether that's signed), and the view's one white button: Install (the install
// sheet, US-STORE-08) or Open. "…" has "Copy to my library…" for admins (US-STORE-29) and the app's website.
import type { StoreAppDetails } from '@hlabs/api';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Box,
  Clapperboard,
  Code,
  Folder,
  Globe,
  House,
  Image,
  type LucideIcon,
  Shield,
  Sparkles,
  SquareCheck,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  iconDefaults,
  Info,
  MoreHorizontal,
} from '@hlabs/icons';
import { isFeatureEnabled } from '@hlabs/shared';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GlassCard,
  ModalDialog,
  PhoneHeader,
  ScrollPane,
  tokens,
} from '@hlabs/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { engineCopy } from '../copy/engine';
import { categoryLabels, storeCopy } from '../copy/store';
import { sourcesCopy } from '../copy/store-sources';
import { useMe } from '../lib/use-me';
import { CopyToLibrary } from './copy-to-library';
import { useEngineRunning } from '../lib/engine-state';
import { browser } from '../lib/browser';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';
import { useIsDesktop } from '../lib/use-media';
import { StoreLogo } from './cards';
import { AccessList, blockers, gb, RequirementNotes } from './app-access';
import { cardAction, storeTags } from './store-app';
import { pageScroller, storeReturnHref } from './store-return';
import { InstallSheet } from './install-sheet';
import { useStoreBack } from './store-layout';
import { useInstalls } from './use-installs';
import { DetailsRolledBack } from '../apps/app-update';
import { explainHomeOnly, HomeOnlyPill, useHomeOnly } from '../public/home-only';
import { publicDashboardCopy as dashCopy } from '../copy/public-dashboard';

const copy = storeCopy;
const Readme = lazy(() => import('./readme'));
/** The details page's logo (104 px, as the AppDetails screen draws it). */
const DETAILS_LOGO = tokens.SIZE_APP_ICON + tokens.SPACE_7;

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

function PrimaryAction({
  details,
  onInstall,
  size = 'lg',
}: {
  details: StoreAppDetails;
  onInstall: () => void;
  /** Smaller beside the app on a phone (PhoneAppDetails). */
  size?: 'md' | 'lg';
}) {
  const installs = useInstalls();
  const { app, host } = details;
  const installed = installs.byId.get(app.id);
  const action = cardAction(app, installed, installs.progress.get(app.id));
  const noPlatform = host.arm64 && !app.arm64;
  const blocked = blockers(details).blocksInstall;
  // Nothing installs without the engine (US-STATE-08).
  const engineDown = useEngineRunning() === false;
  // An install that's running or failed has its own page (US-STORE-12, US-STORE-13).
  if (installed?.state === 'installing' || installed?.state === 'install_failed') {
    return (
      <Link
        to="/store/install/$appId"
        params={{ appId: app.id }}
        className={`hl-btn hl-btn-primary hl-btn-${size} hl-focus no-underline`}
      >
        {installed.state === 'installing' && action.kind === 'installing'
          ? copy.installing(action.percent)
          : copy.installFailed}
      </Link>
    );
  }
  switch (action.kind) {
    case 'open':
      return (
        <Button size={size} onClick={() => browser.open(action.url)}>
          {copy.open}
        </Button>
      );
    case 'installing':
      return (
        <Button size={size} busy disabled>
          {copy.installing(action.percent)}
        </Button>
      );
    case 'installed':
      return <Badge tone="success">{copy.installed}</Badge>;
    case 'install':
      return (
        <Button
          size={size}
          disabled={noPlatform || blocked || engineDown}
          title={engineDown ? engineCopy.startFirst : undefined}
          onClick={onInstall}
        >
          {copy.install}
        </Button>
      );
  }
}

/**
 * Up to 5 screenshots at 16:10; one opens a viewer that arrow keys move through and Escape closes. On a phone they
 * scroll sideways with snap, one per 85% of the screen, each "Screenshot N", and the viewer fills the screen
 * (US-PHONE-11).
 */
function Screenshots({ urls, name, phone = false }: { urls: string[]; name: string; phone?: boolean }) {
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
      {/* Three to a row, as the AppDetails screen draws them; a phone scrolls them sideways. */}
      {phone ? (
        <ul className="-mx-4 m-0 flex snap-x snap-mandatory list-none gap-3 overflow-x-auto scroll-px-4 px-4 py-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {urls.map((url, i) => (
            <li key={url} className="w-[85%] shrink-0 snap-start">
              <button
                type="button"
                className="hl-focus block w-full overflow-hidden rounded-lg border border-hairline bg-solid-widget p-0"
                onClick={() => setOpen(i)}
              >
                <img src={url} alt={copy.screenshot(i + 1)} className="block aspect-[16/10] w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="m-0 flex list-none gap-4 overflow-x-auto p-0 md:grid md:grid-cols-3 md:overflow-visible">
          {urls.map((url, i) => (
            <li key={url} className="w-4/5 shrink-0 md:w-auto">
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
      )}
      <ModalDialog
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open === null ? name : copy.screenshotN(open + 1, urls.length)}
        width="min(90vw, 1100px)"
        tall={phone}
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
      <h2 id="details-whats-new" className="m-0 text-title-2 font-bold">
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
      <dd className="m-0 text-body font-bold">{value}</dd>
    </div>
  );
}

/** "…" beside Install: Copy to my library (admins) and the app's website. */
function MoreMenu({
  d,
  onCopy,
  phone = false,
}: {
  d: StoreAppDetails;
  onCopy: (() => void) | null;
  /** In the phone's bar: a plain button in the link colour. */
  phone?: boolean;
}) {
  // From the internet, copying to a library is at home only (US-SYS-47): the item says so and explains.
  const away = useHomeOnly('store.copyToLibrary');
  if (!onCopy && !d.website) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {phone ? (
          <button type="button" className="hl-p-tbtn hl-focus" aria-label={sourcesCopy.more}>
            <MoreHorizontal aria-hidden {...iconDefaults} />
          </button>
        ) : (
          <Button variant="secondary" className="size-11 rounded-pill p-0" aria-label={sourcesCopy.more}>
            <MoreHorizontal aria-hidden {...iconDefaults} className="size-5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {onCopy ? (
          <DropdownMenuItem onSelect={away ? () => explainHomeOnly('store.copyToLibrary') : onCopy}>
            <Copy aria-hidden {...iconDefaults} className="size-4" />
            {sourcesCopy.copyToLibrary}
            {away ? <HomeOnlyPill label={dashCopy.atHomeOnly} className="ml-auto" /> : null}
          </DropdownMenuItem>
        ) : null}
        {d.website ? (
          <DropdownMenuItem onSelect={() => browser.open(d.website!)}>
            <ExternalLink aria-hidden {...iconDefaults} className="size-4" />
            {sourcesCopy.openWebsite}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppDetails({ appId, shippedPhase }: { appId: string; shippedPhase?: number }) {
  const details = useAppDetails(appId);
  const installs = useInstalls();
  const isAdmin = useMe().data?.role === 'admin';
  const [copying, setCopying] = useState(false);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { install?: true };
  const desktop = useIsDesktop();
  const storeBack = useStoreBack(storeReturnHref);
  // The version installed here, for the info strip on a phone (only asked for when it's installed).
  const trpc = useTRPC();
  const installedApp = useQuery({
    ...trpc.apps.get.queryOptions({ appId }),
    enabled: !desktop && installs.byId.has(appId) && isAdmin,
    retry: false,
  });
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

  const back = (
    <Link
      to={storeReturnHref()}
      className="hl-focus inline-flex items-center gap-2.5 self-start rounded-xs text-body-sm text-ink-muted no-underline hover:text-ink"
    >
      <ChevronLeft aria-hidden {...iconDefaults} className="size-4" />
      {copy.title}
    </Link>
  );
  const appHeader = (
    <header className="flex flex-col gap-5 md:flex-row md:items-center">
      <StoreLogo app={app} size={DETAILS_LOGO} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className="m-0 text-display font-bold">{app.name}</h1>
        <p className="m-0 text-body text-ink">{app.tagline}</p>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) =>
            t === copy.x86Only ? (
              <Badge key={t} tone="warning">
                <AlertTriangle aria-hidden {...iconDefaults} className="size-3.5" />
                {t}
              </Badge>
            ) : (
              <Badge key={t}>{t}</Badge>
            ),
          )}
          <Badge>{d.source.official ? copy.officialSource : sourcesCopy.fromSource(d.source.name)}</Badge>
          {d.source.signed ? null : (
            <Badge tone="warning">
              <AlertTriangle aria-hidden {...iconDefaults} className="size-3.5" />
              {sourcesCopy.notSigned}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <div className="flex items-center gap-3">
          <PrimaryAction details={d} onInstall={onInstall} />
          <MoreMenu
            d={d}
            onCopy={isAdmin && isFeatureEnabled('storeSources', shippedPhase) ? () => setCopying(true) : null}
          />
        </div>
        {isAdmin ? (
          <CopyToLibrary
            app={{ id: app.id, name: app.name, sourceId: d.source.id }}
            logo={<StoreLogo app={app} size={tokens.SIZE_DOCK_TILE - tokens.SPACE_2} />}
            open={copying}
            onOpenChange={setCopying}
          />
        ) : null}
        <InstallSheet
          details={d}
          open={!!search.install}
          onOpenChange={(open) => {
            if (!open) void navigate({ to: '/store/app/$appId', params: { appId }, search: {}, replace: true });
          }}
        />
      </div>
    </header>
  );

  if (!desktop)
    return (
      <PhoneAppDetails
        d={d}
        back={storeBack}
        tags={tags}
        noPlatform={noPlatform}
        primary={<PrimaryAction details={d} onInstall={onInstall} size="md" />}
        strip={<InfoStrip d={d} installedVersion={installedApp.data?.version ?? null} />}
        more={
          <MoreMenu
            d={d}
            phone
            onCopy={isAdmin && isFeatureEnabled('storeSources', shippedPhase) ? () => setCopying(true) : null}
          />
        }
        notes={
          <>
            <DetailsRolledBack appId={appId} installed={installs.byId.has(appId)} />
            {noPlatform ? (
              <p role="note" className="m-0 flex items-start gap-3 rounded-sm bg-solid-widget px-4 py-3 text-subhead">
                <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {copy.noArm64[host.os]} {copy.runsOnIntel}
                </span>
              </p>
            ) : null}
            {d.overlaps.map((o) => (
              <p
                key={o}
                role="note"
                className="m-0 flex items-start gap-3 rounded-sm bg-solid-widget px-4 py-3 text-subhead"
              >
                <Info aria-hidden {...iconDefaults} className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{copy.overlaps[o]}</span>
              </p>
            ))}
            <RequirementNotes d={d} />
          </>
        }
        sheets={
          <>
            {isAdmin ? (
              <CopyToLibrary
                app={{ id: app.id, name: app.name, sourceId: d.source.id }}
                logo={<StoreLogo app={app} size={tokens.SIZE_DOCK_TILE - tokens.SPACE_2} />}
                open={copying}
                onOpenChange={setCopying}
              />
            ) : null}
            <InstallSheet
              details={d}
              open={!!search.install}
              onOpenChange={(open) => {
                if (!open) void navigate({ to: '/store/app/$appId', params: { appId }, search: {}, replace: true });
              }}
            />
          </>
        }
      />
    );

  // A window as tall as the screen allows: the back link and the app (desktop) stay put and only what's below them
  // scrolls. On a phone the app scrolls too, so the content isn't squeezed under it.
  // The body sits inside the scroller's right margin and scrollbar gutter (16px), so its right padding is 16px less
  // than the header's and the two line up.
  return (
    <GlassCard level={2} className="mx-auto flex min-h-0 w-full max-w-window flex-1 flex-col overflow-hidden p-0">
      <ScrollPane
        className="flex-1"
        headerClassName="px-6 pt-6 pb-5 md:px-10 md:pt-8"
        scrollClassName="mr-2 mb-5"
        bodyClassName="pl-6 pr-2 pb-4 md:pl-10 md:pr-6"
        header={
          desktop ? (
            <div className="flex flex-col gap-6">
              {back}
              {appHeader}
            </div>
          ) : (
            back
          )
        }
      >
        <div className="flex flex-col gap-6">
          {desktop ? null : appHeader}
          <DetailsRolledBack appId={appId} installed={installs.byId.has(appId)} />
          {noPlatform ? (
            <p
              role="note"
              className="m-0 flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-body-sm text-ink"
            >
              <AlertTriangle aria-hidden {...iconDefaults} className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                {copy.noArm64[host.os]} {copy.runsOnIntel}
              </span>
            </p>
          ) : null}
          {d.overlaps.map((o) => (
            <p
              key={o}
              role="note"
              className="m-0 flex items-start gap-3 rounded-md border border-accent/40 bg-accent-wash px-4 py-3 text-body-sm text-ink"
            >
              <Info aria-hidden {...iconDefaults} className="mt-0.5 size-4 shrink-0 text-accent" />
              <span>{copy.overlaps[o]}</span>
            </p>
          ))}
          <RequirementNotes d={d} />
          <Screenshots urls={d.screenshots} name={app.name} />
          <div className="grid gap-8 lg:grid-cols-[1fr_23rem]">
            <div className="flex min-w-0 flex-col gap-6">
              <section aria-labelledby="details-about" className="flex flex-col gap-2">
                <h2 id="details-about" className="m-0 text-title-2 font-bold">
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
                {d.packagedFrom ? (
                  <p className="m-0 text-body-sm text-ink-muted">
                    {copy.packagedWith(d.packagedFrom.store, d.packagedFrom.license)}
                  </p>
                ) : null}
              </section>
              {d.releaseNotes ? <WhatsNew notes={d.releaseNotes.trim()} /> : null}
              <AccessList d={d} />
            </div>
            <div className="flex flex-col gap-6">
              <dl aria-label={copy.facts} className="m-0 flex flex-col gap-2">
                <Fact label={copy.version} value={d.version} />
                {noPlatform ? <Fact label={copy.runsOn} value={copy.intelAndAmd} /> : null}
                {d.services.length ? <Fact label={copy.runsAs} value={runsAs(d.services)} /> : null}
                <Fact label={copy.opensAt} value={d.address} />
                <Fact
                  label={sourcesCopy.sourceFact}
                  value={(d.source.signed ? sourcesCopy.sourceSigned : sourcesCopy.sourceNotSigned)(d.source.name)}
                />
                {d.folders.length ? (
                  <Fact label={copy.needsAccess} value={d.folders.map((f) => f.label).join(', ')} />
                ) : null}
              </dl>
            </div>
          </div>
        </div>
      </ScrollPane>
    </GlassCard>
  );
}

/**
 * PhoneAppDetails (US-PHONE-11, PhoneRedesignA_Details): "‹ App Store", the app beside its logo with Install (or
 * Open) under its tagline, the chips (category, Apple Silicon, hlabs official), the screenshots sideways, what it does,
 * and the facts as an inset list: Version, Runs as and Needs access to. The rest follows as on the desktop.
 */
function PhoneAppDetails({
  d,
  back,
  tags,
  noPlatform,
  primary,
  more,
  notes,
  sheets,
  strip,
}: {
  d: StoreAppDetails;
  /** The info strip under the app. */
  strip: ReactNode;
  back: { label: string; onBack: () => void };
  tags: string[];
  noPlatform: boolean;
  primary: ReactNode;
  more: ReactNode;
  notes: ReactNode;
  sheets: ReactNode;
}) {
  const { app } = d;
  const fact = (label: string, value: string) => (
    <div className="hl-p-row">
      <span className="hl-p-row-main">
        <dt className="hl-p-row-text text-ink-muted">{label}</dt>
        <dd className="m-0 min-w-0 max-w-[60%] py-2.5 text-right">{value}</dd>
      </span>
    </div>
  );
  return (
    <div className="flex w-full flex-col gap-5 pb-2">
      <PhoneHeader title={app.name} large={false} back={back} barTrailing={more} />
      <header className="-mt-2 flex items-start gap-4">
        <StoreLogo app={app} size={DETAILS_LOGO} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="m-0 text-title-1 font-bold">{app.name}</h1>
          <p className="m-0 text-row text-ink-muted">{app.tagline}</p>
          <div className="mt-1.5 flex items-center">{primary}</div>
        </div>
      </header>
      {strip}
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) =>
          t === copy.x86Only ? (
            <Badge key={t} tone="warning">
              <AlertTriangle aria-hidden {...iconDefaults} className="size-3.5" />
              {t}
            </Badge>
          ) : (
            <Badge key={t}>{t}</Badge>
          ),
        )}
        <Badge>{d.source.official ? copy.officialSource : sourcesCopy.fromSource(d.source.name)}</Badge>
        {d.source.signed ? null : (
          <Badge tone="warning">
            <AlertTriangle aria-hidden {...iconDefaults} className="size-3.5" />
            {sourcesCopy.notSigned}
          </Badge>
        )}
      </div>
      {notes}
      <Screenshots urls={d.screenshots} name={app.name} phone />
      <section aria-labelledby="details-about" className="flex flex-col gap-2">
        <h2 id="details-about" className="sr-only">
          {copy.about}
        </h2>
        {d.readme ? (
          <Suspense fallback={null}>
            <Readme markdown={d.readme} />
          </Suspense>
        ) : (
          paragraphs(d.description).map((p) => (
            <p key={p} className="m-0 text-row text-ink">
              {p}
            </p>
          ))
        )}
        {d.packagedFrom ? (
          <p className="m-0 text-footnote text-ink-muted">
            {copy.packagedWith(d.packagedFrom.store, d.packagedFrom.license)}
          </p>
        ) : null}
      </section>
      {d.releaseNotes ? <WhatsNew notes={d.releaseNotes.trim()} /> : null}
      <AccessList d={d} />
      <section aria-labelledby="details-information" className="flex flex-col gap-2">
        <h2 id="details-information" className="m-0 text-title-2 font-bold">
          {copy.information}
        </h2>
        <dl aria-label={copy.facts} className="hl-p-group m-0">
          {fact(copy.version, d.version)}
          {noPlatform ? fact(copy.runsOn, copy.intelAndAmd) : null}
          {/* "3 containers" (US-PHONE-11), counted from the compose services. */}
          {d.services.length ? fact(copy.runsAs, copy.containers(d.services.length, [])) : null}
          {d.folders.length ? fact(copy.needsAccess, d.folders.map((f) => f.label).join(', ')) : null}
          {fact(copy.opensAt, d.address)}
          {fact(
            sourcesCopy.sourceFact,
            (d.source.signed ? sourcesCopy.sourceSigned : sourcesCopy.sourceNotSigned)(d.source.name),
          )}
        </dl>
      </section>
      {sheets}
    </div>
  );
}

/** A manifest category's glyph for the info strip (PhoneRedesignA_Details). */
const CATEGORY_GLYPH: Record<string, LucideIcon> = {
  media: Clapperboard,
  photos: Image,
  files: Folder,
  network: Globe,
  home: House,
  developer: Code,
  ai: Sparkles,
  productivity: SquareCheck,
  security: Shield,
  finance: Wallet,
  books: BookOpen,
  monitoring: Activity,
};

/**
 * PhoneAppDetails' strip under the app (PhoneRedesignA_Details): Version ("Latest", or the version installed here when
 * it's another), Memory ("at least") and Disk ("to start") from the manifest, "—" where it doesn't say, and the
 * category with its glyph.
 */
export function InfoStrip({ d, installedVersion }: { d: StoreAppDetails; installedVersion: string | null }) {
  const { app, requirements: r } = d;
  const Glyph = CATEGORY_GLYPH[app.category] ?? Box;
  const cell = (label: string, value: ReactNode, sub: string | null) => (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 text-center">
      <dt className="text-footnote text-ink-muted">{label}</dt>
      <dd className="m-0 flex min-h-7 items-center text-title-2 font-bold">{value}</dd>
      {sub ? <dd className="m-0 truncate text-footnote text-ink-muted">{sub}</dd> : null}
    </div>
  );
  const size = (bytes: number | null) => (bytes === null ? copy.noFigure : copy.gbFigure(gb(bytes)));
  return (
    <dl aria-label={copy.atAGlance} className="hl-p-strip m-0">
      {cell(
        copy.version,
        d.version,
        installedVersion && installedVersion !== d.version ? copy.installedVersion(installedVersion) : copy.latest,
      )}
      {cell(copy.memory, size(r.memoryBytes), r.memoryBytes === null ? null : copy.atLeast)}
      {cell(copy.disk, size(r.diskBytes), r.diskBytes === null ? null : copy.toStart)}
      {cell(
        copy.category,
        <Glyph aria-hidden {...iconDefaults} />,
        copy.categoryShort[app.category] ?? categoryLabels[app.group],
      )}
    </dl>
  );
}
