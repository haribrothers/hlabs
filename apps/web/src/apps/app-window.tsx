// The app window (US-APP-01): an app's own web interface in a frame over the wallpaper, with its name, status and
// address. Only one at a time (it's a route, /apps/:appId, so it survives a reload); closing it doesn't stop the app.
// The frame is mounted only while the app is running, so no forward-auth or 502 pages show in it (US-APP-03).
// It ends above the Dock, which stays usable (US-HOME-23); App settings and Logs open over it as dialogs and close
// back to it, so the app keeps its place (D-096).
import type { AppDetail, AppState } from '@hlabs/api';
import {
  AppLogo,
  appTileLook,
  ExternalLink,
  House,
  iconDefaults,
  Loader2,
  Lock,
  RotateCw,
  SlidersHorizontal,
  TextAlignStart,
  X,
} from '@hlabs/icons';
import { Button, GlassCard, IconButton, StatusDot } from '@hlabs/ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { appsCopy } from '../copy/apps';
import { engineCopy } from '../copy/engine';
import { browser } from '../lib/browser';
import { useMe } from '../lib/use-me';
import { appBaseUrl, useApp } from './use-app';
import { closeWindow, openWindow } from './open-windows';
import { AppLogs } from './app-logs';
import { AppSettings } from './app-settings';
import { PanelBoundary } from './panel-boundary';
import { statusDot } from './status-dot';
import { useAppCommands } from './use-app-commands';

const copy = appsCopy;
/** The logo beside the name in the window header. */
const HEADER_LOGO = 28;
/** A spinner shows once the frame has taken this long… */
export const SPINNER_AFTER_MS = 1_000;
/** …and a way out once it has taken this long (US-APP-01). */
export const SLOW_AFTER_MS = 20_000;
/** How long "This app was removed." shows before the window closes to Home (US-APP-12). */
export const REMOVED_CLOSE_MS = 2_500;

/** States on the way somewhere: the frame area shows a spinner and the app comes back by itself (US-APP-02, 03). */
const BUSY = new Set<AppState>(['starting', 'restarting', 'stopping', 'updating', 'rolling_back', 'uninstalling']);

/** The app's frame: a spinner after 1 s without `load`, and "taking a while" with a new-tab way out after 20 s. */
function AppFrame({ app, src }: { app: AppDetail; src: string }) {
  const [loaded, setLoaded] = useState(false);
  const [waited, setWaited] = useState<'short' | 'spinner' | 'slow'>('short');
  // Each load is a fresh AppFrame (keyed by its address and reloads), so the timers start from zero.
  useEffect(() => {
    const spin = setTimeout(() => setWaited('spinner'), SPINNER_AFTER_MS);
    const slow = setTimeout(() => setWaited('slow'), SLOW_AFTER_MS);
    return () => {
      clearTimeout(spin);
      clearTimeout(slow);
    };
  }, []);
  return (
    <>
      <iframe
        src={src}
        title={copy.frameTitle(app.name)}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 size-full border-0 ${loaded ? '' : 'invisible'}`}
      />
      {loaded ? null : waited === 'slow' ? (
        <FramePanel>
          <p className="m-0 text-body text-ink">{copy.slow}</p>
          <Button variant="secondary" onClick={() => browser.open(src)}>
            {copy.openInNewTab}
          </Button>
        </FramePanel>
      ) : waited === 'spinner' ? (
        <FramePanel>
          <Loader2
            role="img"
            aria-label={copy.loading(app.name)}
            {...iconDefaults}
            className="size-8 animate-spin text-ink-muted motion-reduce:animate-none"
          />
        </FramePanel>
      ) : null}
    </>
  );
}

/** Centred content in the frame area: a spinner, a message and what to do. */
export function FramePanel({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>
  );
}

export type WindowPanel = 'settings' | 'logs';

/** The dialog open over the window, from the address (`?panel=settings|logs&from=settings&at=…`). */
export function windowPanel(search: Record<string, unknown>): { panel?: WindowPanel; from?: 'settings'; at?: number } {
  return {
    ...(search.panel === 'settings' || search.panel === 'logs' ? { panel: search.panel } : {}),
    ...(search.from === 'settings' ? { from: 'settings' as const } : {}),
    ...(typeof search.at === 'number' ? { at: search.at } : {}),
  };
}

export function AppWindow({ appId }: { appId: string }) {
  const { panel, from, at } = windowPanel(useSearch({ strict: false }) as Record<string, unknown>);
  const navigate = useNavigate();
  const { data: app, lastChange } = useApp(appId);
  // Uninstalled while open (US-APP-12): say so, then go Home.
  const removed = lastChange?.detail === 'removed';
  const isAdmin = useMe().data?.role === 'admin';
  const [reloadKey] = useState(0);
  // Back to Home leaves the window open behind Home, in the Dock; Close app, Esc and an uninstall close it (US-HOME-23).
  const home = () => void navigate({ to: '/' });
  const close = () => {
    closeWindow(appId);
    home();
  };
  // Dialogs over the window: in the address, so Back in the browser closes them, and the window stays mounted.
  const showPanel = (next: { panel?: WindowPanel; from?: 'settings' }) =>
    void navigate({ to: '/apps/$appId', params: { appId }, search: next });
  const openLogs = () => showPanel({ panel: 'logs' });
  const openSettings = () => showPanel({ panel: 'settings' });
  const closePanel = () => showPanel({});
  // Restart (US-APP-02): the label says "Restarting…" at once; the frame comes back when it's running again. An app
  // that isn't responding is started again (US-APP-03).
  const { start, restart } = useAppCommands(app, appId);

  // Esc closes it while focus is on the window, not inside the app's frame (which keeps its own keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.activeElement?.tagName === 'IFRAME') return;
      // A dialog over the window takes Escape itself.
      if (document.querySelector('[role="dialog"]')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only navigates
  }, []);

  useEffect(() => {
    if (app) document.title = copy.docTitle(app.name);
  }, [app]);
  // Open once it's shown: a member the app isn't shared with never gets a Dock tile for it.
  const shown = app !== undefined;
  useEffect(() => {
    if (shown) openWindow(appId);
  }, [shown, appId]);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(close, REMOVED_CLOSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only navigates
  }, [removed]);

  if (!app) return null;
  const look = appTileLook(app.name, app.icon, HEADER_LOGO);
  const base = appBaseUrl(app);
  const src = `${base}${app.webPath === '/' ? '' : app.webPath}`;
  const canRestart = (app.state === 'running' || app.state === 'error') && app.engineRunning;
  const body = removed ? (
    <FramePanel>
      <p className="m-0 text-body text-ink">{copy.appRemoved}</p>
    </FramePanel>
  ) : !app.engineRunning ? (
    // The engine-stopped message (US-STATE-08) whatever the app's last state was (US-APP-03).
    <FramePanel>
      <p className="m-0 text-body font-bold text-ink">{engineCopy.stoppedTitle}</p>
      <p className="m-0 text-body text-ink-muted">{engineCopy.stoppedBody}</p>
    </FramePanel>
  ) : app.state === 'running' ? (
    app.embed ? (
      <AppFrame key={`${src}#${reloadKey}`} app={app} src={src} />
    ) : (
      <FramePanel>
        <p className="m-0 text-body text-ink">{copy.opensInTab(app.name)}</p>
        <Button onClick={() => browser.open(base)}>{copy.openInNewTab}</Button>
      </FramePanel>
    )
  ) : BUSY.has(app.state) ? (
    <FramePanel>
      <Loader2
        aria-hidden
        {...iconDefaults}
        className="size-8 animate-spin text-ink-muted motion-reduce:animate-none"
      />
      <StatusDot status={statusDot(app.state)}>{copy.status[app.state]}</StatusDot>
    </FramePanel>
  ) : app.state === 'stopped' ? (
    <FramePanel>
      <p className="m-0 text-body text-ink">{copy.isStopped(app.name)}</p>
      {isAdmin ? (
        <Button disabled={start.isPending} onClick={() => start.mutate()}>
          {copy.start}
        </Button>
      ) : (
        <p className="m-0 text-body text-ink-muted">{copy.askToStart}</p>
      )}
    </FramePanel>
  ) : app.state === 'error' ? (
    <FramePanel>
      <p className="m-0 text-body text-ink">{copy.notResponding(app.name)}</p>
      {isAdmin ? (
        <div className="flex flex-wrap justify-center gap-3">
          <Button disabled={restart.isPending} onClick={() => restart.mutate()}>
            {copy.restartApp}
          </Button>
          <Button variant="secondary" onClick={openLogs}>
            {copy.logs}
          </Button>
        </div>
      ) : (
        <p className="m-0 text-body text-ink-muted">{copy.askToRestart}</p>
      )}
    </FramePanel>
  ) : (
    <FramePanel>
      <StatusDot status={statusDot(app.state)}>{copy.status[app.state]}</StatusDot>
    </FramePanel>
  );

  return (
    // Ends above the Dock, which stays usable for switching apps (US-HOME-23, D-096).
    <section aria-label={copy.window} className="hl-window-layer">
      <GlassCard level={2} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-window p-0">
        <header className="flex items-center gap-3 px-3 py-2.5 md:px-3.5">
          <IconButton label={copy.backToHome} onClick={home}>
            <House aria-hidden {...iconDefaults} className="size-4" />
          </IconButton>
          <AppLogo
            decorative
            name={app.name}
            src={app.icon.logoUrl}
            colors={look.colors}
            fallbackIcon={look.fallbackIcon}
            size={HEADER_LOGO}
            radius={8}
          />
          <h1 className="m-0 truncate text-body font-bold">{app.name}</h1>
          <span className="shrink-0 text-body-sm">
            <StatusDot status={statusDot(app.state)}>{copy.status[app.state]}</StatusDot>
          </span>
          <div className="hidden min-w-0 flex-1 justify-center lg:flex">
            <span className="inline-flex min-w-0 items-center gap-2 rounded-pill bg-surface-control px-4 py-1.5 font-mono text-body-sm text-ink-muted">
              <Lock aria-hidden {...iconDefaults} className="size-3.5 shrink-0" />
              <span className="truncate">{new URL(base).host}</span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {/* Members get only the new tab and Close (US-APP-02). */}
            {isAdmin ? (
              <>
                <IconButton
                  label={copy.restartApp}
                  disabled={!canRestart || restart.isPending}
                  onClick={() => restart.mutate()}
                >
                  <RotateCw aria-hidden {...iconDefaults} className="size-4" />
                </IconButton>
                <IconButton label={copy.logs} onClick={openLogs}>
                  <TextAlignStart aria-hidden {...iconDefaults} className="size-4" />
                </IconButton>
                <IconButton label={copy.appSettings} onClick={openSettings}>
                  <SlidersHorizontal aria-hidden {...iconDefaults} className="size-4" />
                </IconButton>
              </>
            ) : null}
            <IconButton label={copy.openInNewTab} onClick={() => browser.open(app.embed ? src : base)}>
              <ExternalLink aria-hidden {...iconDefaults} className="size-4" />
            </IconButton>
            <span aria-hidden className="mx-1 h-6 w-px bg-hairline" />
            <IconButton label={copy.closeApp} onClick={close}>
              <X aria-hidden {...iconDefaults} className="size-4" />
            </IconButton>
          </div>
        </header>
        <div className="relative mx-2.5 mb-2.5 min-h-0 flex-1 overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--wall-base)_94%,black)]">
          {body}
        </div>
      </GlassCard>
      <PanelBoundary key={panel ?? ''} onClose={closePanel}>
        {isAdmin && panel === 'settings' ? (
          <AppSettings
            appId={appId}
            onClose={closePanel}
            onOpenLogs={() => showPanel({ panel: 'logs', from: 'settings' })}
          />
        ) : null}
        {isAdmin && panel === 'logs' ? (
          <AppLogs
            appId={appId}
            at={at}
            backTo={from === 'settings' ? 'settings' : 'app'}
            onBack={from === 'settings' ? openSettings : closePanel}
          />
        ) : null}
      </PanelBoundary>
    </section>
  );
}
