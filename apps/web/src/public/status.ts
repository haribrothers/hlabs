// Cloudflare Tunnel's state and every public app (`public.status`, admins), asked again every 2 s while signing in
// to Cloudflare or setting up (US-SYS-43); events keep it current otherwise.
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/trpc';

/** How often to ask while signing in to Cloudflare or setting up (events usually come first). */
export const STATUS_POLL_MS = 2_000;

export function usePublicStatus(enabled = true) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.public.status.queryOptions(),
    enabled,
    retry: false,
    refetchInterval: (q) => {
      const state = q.state.data?.cloudflare.state;
      return state === 'signingIn' || state === 'settingUp' ? STATUS_POLL_MS : false;
    },
  });
}
