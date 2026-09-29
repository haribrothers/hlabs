// tRPC client: batched HTTP for queries and mutations, SSE for subscriptions (D-004).
import type { AppRouter } from '@hlabs/api';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createTRPCClient, TRPCClientError, httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { csrfHeaders } from './csrf';
import { offlineLink } from './offline-link';
import { closingEventSource, streamLink } from './stream-link';
import { setupHeaders } from './setup-token';

let onAuthLost: (() => void) | null = null;

/** What to do when a call says the session is gone (expired or revoked): the app sends people to log in (US-AUTH-14). */
export function setAuthLostHandler(fn: (() => void) | null) {
  onAuthLost = fn;
}

export const isAuthLost = (err: unknown) =>
  err instanceof TRPCClientError && (err.data as { hlabsCode?: string } | undefined)?.hlabsCode === 'AUTH_REQUIRED';

const authLost = (err: unknown) => {
  if (isAuthLost(err)) onAuthLost?.();
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: authLost }),
  mutationCache: new MutationCache({ onError: authLost }),
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false },
    // Offline, mutations reach the offline link and fail at once instead of waiting paused (US-STATE-19).
    mutations: { networkMode: 'always' },
  },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: [
        streamLink({ onReset: () => void queryClient.invalidateQueries() }),
        httpSubscriptionLink({ url: '/trpc', EventSource: closingEventSource() }),
      ],
      false: [
        offlineLink(),
        httpBatchLink({
          url: '/trpc',
          headers: ({ opList }) => ({ ...setupHeaders(opList.map((op) => op.path)), ...csrfHeaders() }),
        }),
      ],
    }),
  ],
});

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
