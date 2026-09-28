import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { captureSetupToken } from './lib/setup-token';
import { queryClient, setAuthLostHandler, TRPCProvider, trpcClient } from './lib/trpc';
import { loginRedirect } from './login/signed-out';
import { routeTree } from './routeTree.gen';

// Before the router reads the address bar, so the token never lands in router state or history.
captureSetupToken();

const router = createRouter({ routeTree, defaultPreload: 'intent' });

// A session that ends while the app is open (expired or revoked) goes to log in, then back here (US-AUTH-14).
setAuthLostHandler(() => {
  const to = loginRedirect(router.state.location);
  if (to) void router.navigate(to);
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
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
