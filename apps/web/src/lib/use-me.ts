// The signed-in person (auth.me): name, role, appearance and the CSRF token.
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

export function useMe(enabled = true) {
  const trpc = useTRPC();
  // Refetched when the window regains focus, so a role change shows up (US-ACCT-01).
  return useQuery({ ...trpc.auth.me.queryOptions(), enabled, retry: false, refetchOnWindowFocus: true });
}
