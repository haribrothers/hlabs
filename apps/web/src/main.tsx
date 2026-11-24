import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { guardTapsOutsideMenus, watchInputMode } from '@hlabs/ui';
import './app.css';
import { captureSetupToken } from './lib/setup-token';
import { listenForInstall, reloadOnNewShell } from './lib/install-app';
import { watchPhoneViewport } from './lib/phone-viewport';
import { queryClient, setAuthLostHandler, TRPCProvider, trpcClient } from './lib/trpc';
import { onceToLogin } from './login/signed-out';
import { routeTree } from './routeTree.gen';
import { RouteError, RouteNotFound } from './shell/route-fallbacks';

// Before the router reads the address bar, so the token never lands in router state or history.
captureSetupToken();
// Before anything renders, so Chrome's install prompt isn't missed (US-INST-28).
listenForInstall();
// The visual viewport for sheets and the on-screen keyboard (US-PHONE-02, US-PHONE-03).
watchPhoneViewport();
// A tablet by touch (D-175, US-TAB-01): <html data-input="touch"> follows the input, so plugging in a mouse switches
// back to the mouse layout without a reload.
watchInputMode();
// …where a tap outside an open menu closes it and opens nothing under the finger (US-TAB-02).
guardTapsOutsideMenus();
// The saved shell for opening offline, in builds only (US-INST-28): a browser that refuses it (a certificate it
// doesn't trust) leaves the dashboard as it was.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  // A new hlabs took over the shell (US-PHONE-24): the page reloads once onto it.
  reloadOnNewShell(navigator.serviceWorker);
}

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Back (or the swipe-back gesture) shows the page where it was scrolled to: the window, and the page's own
  // scroller (<main data-scroll-restoration-id="main">, US-PHONE-04).
  scrollRestoration: true,
  // A page you go into starts at the top of the page's scroller too, not only the window: without this it could keep
  // the page before's place, half scrolled with its compact bar showing (US-PHONE-04).
  scrollToTopSelectors: ['window', '#main'],
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
});

// A session that ends while the app is open (expired or revoked) goes to log in, then back here (US-AUTH-14).
setAuthLostHandler(
  onceToLogin({
    location: () => router.state.location,
    hasUsers: () =>
      queryClient
        .getQueriesData<{ hasUsers?: boolean }>({ queryKey: [['onboarding', 'status']] })
        .find(([, data]) => data)?.[1]?.hasUsers,
    navigate: (to) => router.navigate(to),
  }),
);

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
  interface HistoryState {
    /** Where a view such as App settings was opened from, for its Close (US-APP-04). */
    from?: string;
    /** Logs opened from that app's settings, so their Back is a step back (US-APP-08, D-124). */
    fromSettings?: boolean;
    /** App settings or Logs were opened over this page (D-166): closing them steps back. */
    appOverlay?: boolean;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
