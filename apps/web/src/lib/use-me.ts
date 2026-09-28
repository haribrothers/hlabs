// The signed-in person (auth.me): name, role, appearance and the CSRF token.
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

export function useMe(enabled = true) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.auth.me.queryOptions(), enabled, retry: false });
}
