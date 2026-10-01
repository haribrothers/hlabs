// Whether the container engine runs (US-STATE-08…10), for everyone signed in: system.info, kept current by
// engine.status. EngineWatch (in the shell, once) listens; the rest reads the query, so state lives in the query cache
// and not in local flags.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useTRPC } from './trpc';

/** true or false once known; undefined while loading or signed out. */
export function useEngineRunning(enabled = true): boolean | undefined {
  const trpc = useTRPC();
  const info = useQuery({ ...trpc.system.info.queryOptions(), enabled, retry: false });
  return info.data?.engine.running;
}

export function EngineWatch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['engine.status'] },
      {
        onData: ({ data: event }) => {
          if (event.type !== 'engine.status') return;
          const key = trpc.system.info.queryKey();
          const running = event.data.running;
          queryClient.setQueryData(key, (old) => (old ? { ...old, engine: { ...old.engine, running } } : old));
          void queryClient.invalidateQueries({ queryKey: key });
        },
      },
    ),
  );
  return null;
}
