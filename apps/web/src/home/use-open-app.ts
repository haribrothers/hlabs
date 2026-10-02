// Opening an app the way its Home tile does (US-HOME-03, US-HOME-08, US-APP-01), shared with search (US-HOME-10).
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { homeCopy } from '../copy/home';
import { browser } from '../lib/browser';
import { showToast } from '../lib/toasts';
import { useTRPC } from '../lib/trpc';
import { useMedia } from '../lib/use-media';
import type { HomeApp } from './home-app';
import { appAddress } from '../lib/app-address';

/** The app window opens on a desktop layout (US-APP-01); phones are covered by 12-phone.md. */
export const APP_WINDOW_QUERY = '(min-width: 1024px)';

/** On the tailnet name, apps open on their port there (D-012); otherwise on their .local hostname. */
export function appUrl(app: HomeApp, location: Pick<Location, 'hostname'> = window.location): string {
  return appAddress(app.urls, location);
}

export function useOpenApp(isAdmin: boolean): (app: HomeApp) => void {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const wide = useMedia(APP_WINDOW_QUERY);
  /**
   * An install that's running or failed opens its page (US-STORE-12, US-STORE-14). A running app opens in the app
   * window when it declares web.embed and the screen is wide enough, else in a new tab (US-APP-01, D-038); an app that
   * isn't running opens the window, which says why it can't be shown (US-APP-03).
   */
  const openApp = (app: HomeApp) => {
    if (app.state === 'installing' || app.state === 'install_failed')
      void navigate({ to: '/store/install/$appId', params: { appId: app.id } });
    else if (app.state === 'stopped' || app.state === 'error') void recover(app);
    else if (app.state === 'running' && !(app.embed && wide)) browser.open(appUrl(app));
    else void navigate({ to: '/apps/$appId', params: { appId: app.id } });
  };
  /**
   * A stopped or broken app isn't opened onto a dead page (US-HOME-08): a stopped one offers Start in a toast, a
   * broken one opens its logs with the reason; members are told whom to ask.
   */
  const recover = async (app: HomeApp) => {
    if (!isAdmin) {
      const account = await queryClient.fetchQuery(trpc.account.get.queryOptions()).catch(() => null);
      showToast({
        tone: 'neutral',
        title: homeCopy.recover.askAdmin(app.name, account?.adminName ?? null),
        key: `recover:${app.id}`,
      });
    } else if (app.state === 'stopped') {
      showToast({
        tone: 'neutral',
        title: homeCopy.recover.stopped(app.name),
        key: `recover:${app.id}`,
        actions: [
          {
            kind: 'mutation',
            label: homeCopy.recover.start,
            procedure: 'apps.start',
            input: { appId: app.id },
            done: homeCopy.recover.starting(app.name),
          },
        ],
      });
    } else {
      void navigate({ to: '/apps/$appId/logs', params: { appId: app.id } });
    }
  };
  return openApp;
}
