// tRPC client: batched HTTP for queries and mutations, SSE for subscriptions (D-004).
import type { AppRouter } from '@hlabs/api';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { setupHeaders } from './setup-token';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false } },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: '/trpc' }),
      false: httpBatchLink({ url: '/trpc', headers: ({ opList }) => setupHeaders(opList.map((op) => op.path)) }),
    }),
  ],
});

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
