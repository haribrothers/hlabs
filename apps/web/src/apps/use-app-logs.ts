// An app's log lines for the Logs view (US-APP-08): the last 500, then new ones as they come (apps.watchLogs, from
// where the load ended). At most 5,000 are kept; the oldest go first.
import type { LogLine } from '@hlabs/api';
import { useQuery } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { useTRPC } from '../lib/trpc';

export const INITIAL_LINES = 500;
export const MAX_LINES = 5_000;

export function useAppLogs(appId: string) {
  const trpc = useTRPC();
  const initial = useQuery({
    ...trpc.apps.logs.queryOptions({ appId, tail: INITIAL_LINES }),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [live, setLive] = useState<LogLine[]>([]);
  const loaded = initial.data?.lines;
  const since = loaded?.at(-1)?.ts;
  /** Docker's `since` includes its own moment, so the lines at the boundary come again. */
  const seen = new Set(loaded?.filter((l) => l.ts === since).map(key));
  useSubscription(
    trpc.apps.watchLogs.subscriptionOptions(
      { appId, ...(since === undefined ? {} : { since }) },
      {
        enabled: loaded !== undefined,
        onData: (line) => {
          if (since !== undefined && (line.ts < since || seen.has(key(line)))) return;
          setLive((prev) => [...prev, line].slice(-MAX_LINES));
        },
      },
    ),
  );
  const lines = loaded ? [...loaded, ...live].slice(-MAX_LINES) : [];
  return { lines, loading: initial.isPending, error: initial.error };
}

const key = (l: LogLine) => `${l.ts}\n${l.service}\n${l.stream}\n${l.line}`;
