import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { captureSetupToken } from './lib/setup-token';
import { listenForInstall } from './lib/install-app';
import { queryClient, setAuthLostHandler, TRPCProvider, trpcClient } from './lib/trpc';
import { onceToLogin } from './login/signed-out';
import { routeTree } from './routeTree.gen';
import { RouteError, RouteNotFound } from './shell/route-fallbacks';

// Before the router reads the address bar, so the token never lands in router state or history.
captureSetupToken();
// Before anything renders, so Chrome's install prompt isn't missed (US-INST-28).
listenForInstall();
// The saved shell for opening offline, in builds only (US-INST-28): a browser that refuses it (a certificate it
// doesn't trust) leaves the dashboard as it was.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
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
