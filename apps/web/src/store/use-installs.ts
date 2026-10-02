// Install state for store cards (US-STORE-01): the installed apps (apps.list), refreshed on app.stateChanged, and the
// latest install percent per app from app.installProgress, so buttons change without a reload.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useMemo, useState } from 'react';
import { useTRPC } from '../lib/trpc';
import type { InstalledApp } from './store-app';

export interface Installs {
  byId: Map<string, InstalledApp>;
  progress: Map<string, number>;
}

export function useInstalls(): Installs {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useQuery({ ...trpc.apps.list.queryOptions(), retry: false });
  const [progress, setProgress] = useState(() => new Map<string, number>());
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['app.stateChanged', 'app.installProgress'] },
      {
        onData: ({ data: event }) => {
          if (event.type === 'app.installProgress') {
            const { appId, progress: pct } = event.data;
            setProgress((m) => (m.get(appId) === pct ? m : new Map(m).set(appId, pct)));
          } else {
            void queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
          }
        },
      },
    ),
  );
  const byId = useMemo(() => new Map((list.data?.apps ?? []).map((a) => [a.id, a])), [list.data]);
  return { byId, progress };
}
