// App settings and Logs as dialogs over whatever page is open (D-166): `?settings=<appId>` or `?logs=<appId>` (with
// `from=settings`, `at` and `service` as the app window has them), so the page stays behind them, Back and Escape
// close them where they were opened, and the address can be reloaded. The app window keeps its own (`?panel=`, D-096).
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { AppLogs } from './app-logs';
import { AppSettings } from './app-settings';
import { PanelBoundary } from './panel-boundary';

export interface AppOverlaySearch {
  settings?: string;
  /** App settings opened at a public app's Visits (US-APP-29): from Settings › Network or the attack notification. */
  view?: 'visits';
  logs?: string;
  /** Logs opened from App settings: their Back goes back to them. */
  from?: 'settings';
  /** Logs opened at a moment (US-STORE-17). */
  at?: number;
  /** Logs of one container (US-APP-21). */
  service?: string;
}

const OVERLAY_KEYS = ['settings', 'view', 'logs', 'from', 'at', 'service'] as const;
const APP_ID = /^[a-z0-9][a-z0-9-]*$/;

/** The dialog in an address's search, if any. */
export function appOverlay(search: Record<string, unknown>): AppOverlaySearch {
  const id = (v: unknown) => (typeof v === 'string' && APP_ID.test(v) ? v : undefined);
  const settings = id(search.settings);
  const logs = settings ? undefined : id(search.logs);
  if (!settings && !logs) return {};
  const at =
    typeof search.at === 'number' ? search.at : /^\d+$/.test(String(search.at ?? '')) ? Number(search.at) : undefined;
  return {
    ...(settings ? { settings } : {}),
    ...(settings && search.view === 'visits' ? { view: 'visits' as const } : {}),
    ...(logs ? { logs } : {}),
    ...(logs && search.from === 'settings' ? { from: 'settings' as const } : {}),
    ...(logs && at !== undefined ? { at } : {}),
    ...(logs && typeof search.service === 'string' && search.service ? { service: search.service } : {}),
  };
}

/**
 * The dialog an app page's address stands for (`/apps/<id>/settings`, `/apps/<id>/logs?at=…&service=…`), as links from
 * notifications, toasts, the tray and older bookmarks have them; null for any other address.
 */
export function overlayForPath(href: string): AppOverlaySearch | null {
  const url = new URL(href, 'http://hlabs.invalid');
  const m = /^\/apps\/([a-z0-9][a-z0-9-]*)\/(settings|logs)\/?$/.exec(url.pathname);
  if (!m) return null;
  const search = Object.fromEntries(url.searchParams);
  return appOverlay(m[2] === 'settings' ? { settings: m[1], view: search.view } : { ...search, logs: m[1] });
}

/** The search without the dialog's keys. */
const withoutOverlay = (search: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(search).filter(([k]) => !(OVERLAY_KEYS as readonly string[]).includes(k)));

/** Opens and closes the dialogs over the page that's open now. */
export function useAppOverlay() {
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const search = location.search as Record<string, unknown>;
  const go = (next: AppOverlaySearch, replace = false) =>
    void navigate({
      // The page that's open, whatever it is: only the dialog changes.
      to: location.pathname as '/',
      search: { ...withoutOverlay(search), ...next } as never,
      // Opened here: closing steps back to the page as it was, so Back doesn't open it again.
      state: (prev) => ({ ...prev, appOverlay: true }),
      replace,
    });
  return {
    openSettings: (appId: string, opts: { view?: 'visits' } = {}) =>
      go({ settings: appId, ...(opts.view ? { view: opts.view } : {}) }),
    /** Logs' Back: App settings take their place, so their Close returns to the page, never to Logs (D-124). */
    backToSettings: (appId: string) => go({ settings: appId }, true),
    openLogs: (appId: string, opts: { at?: number; service?: string; fromSettings?: boolean } = {}) =>
      go(
        {
          logs: appId,
          ...(opts.fromSettings ? { from: 'settings' as const } : {}),
          ...(opts.at !== undefined ? { at: opts.at } : {}),
          ...(opts.service ? { service: opts.service } : {}),
        },
        // From App settings, Logs take their place, so Close returns to the page (D-124).
        opts.fromSettings,
      ),
    /** Follows a link: an app page's address opens its dialog here; anything else navigates. */
    follow: (href: string) => {
      const overlay = overlayForPath(href);
      if (overlay) go(overlay);
      else void navigate({ to: href });
    },
    close: () => {
      if (location.state.appOverlay && router.history.canGoBack()) router.history.back();
      else void navigate({ to: location.pathname as '/', search: withoutOverlay(search) as never, replace: true });
    },
  };
}

/** App settings or Logs over the page, from its address. Not over the app window, which has its own (D-096). */
export function AppOverlay() {
  const location = useLocation();
  const overlay = appOverlay(location.search as Record<string, unknown>);
  const { openLogs, backToSettings, close } = useAppOverlay();
  if (location.pathname.startsWith('/apps/')) return null;
  const appId = overlay.settings ?? overlay.logs;
  if (!appId) return null;
  return (
    <PanelBoundary key={`${overlay.settings ? 'settings' : 'logs'}:${appId}`} onClose={close}>
      {overlay.settings ? (
        <AppSettings
          appId={appId}
          initialView={overlay.view}
          onClose={close}
          onOpenLogs={() => openLogs(appId, { fromSettings: true })}
          onOpenContainerLogs={(service) => openLogs(appId, { fromSettings: true, service })}
        />
      ) : (
        <AppLogs
          appId={appId}
          at={overlay.at}
          service={overlay.service}
          backTo="settings"
          onBack={() => backToSettings(appId)}
        />
      )}
    </PanelBoundary>
  );
}
