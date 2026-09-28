// Renders a screen with a fake daemon (tRPC handlers by path) and a memory router, for component tests.
import type { AppRouter } from '@hlabs/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { createTRPCClient, TRPCClientError, type TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ComponentType } from 'react';
import { TRPCProvider } from '../lib/trpc';

export type Handlers = Record<string, (input: unknown) => unknown>;

/** An error the way the daemon sends it: a tRPC error carrying an hlabsCode. */
export function daemonError(hlabsCode: string, detail: Record<string, unknown> | null = null) {
  return new TRPCClientError(hlabsCode, { result: { error: { data: { hlabsCode, detail } } } as never });
}

export function renderScreen(Screen: ComponentType, handlers: Handlers, opts: { path?: string } = {}) {
  const calls: Array<{ path: string; input: unknown }> = [];
  const link: TRPCLink<AppRouter> =
    () =>
    ({ op }) =>
      observable((observer) => {
        calls.push({ path: op.path, input: op.input });
        const handler = handlers[op.path];
        Promise.resolve()
          .then(() => {
            if (!handler) throw new Error(`No fake for ${op.path}`);
            return handler(op.input);
          })
          .then(
            (data) => {
              observer.next({ result: { type: 'data', data } });
              observer.complete();
            },
            (err: unknown) => {
              const e = err instanceof TRPCClientError ? err : TRPCClientError.from(err as Error);
              observer.error(e as never);
            },
          );
      });
  const client = createTRPCClient<AppRouter>({ links: [link] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  const root = createRootRoute({ component: Outlet });
  const path = opts.path ?? '/';
  const screen = createRoute({ getParentRoute: () => root, path, component: () => <Screen /> });
  const other = createRoute({ getParentRoute: () => root, path: '$', component: () => <p>elsewhere</p> });
  const router = createRouter({
    routeTree: root.addChildren([screen, other]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        <RouterProvider router={router as never} />
      </TRPCProvider>
    </QueryClientProvider>,
  );
  return { ...result, calls, router };
}
