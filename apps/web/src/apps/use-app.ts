// One installed app (apps.get) kept current: its state follows app.stateChanged at once (US-APP-02: within 1 s), and
// the rest is refetched; whether the engine runs follows engine.status. Opens the "no access" page for a member the
// app isn't shared with (US-APP-03, D-070).
import type { AppDetail, AppState } from '@hlabs/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';

export function useApp(appId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = trpc.apps.get.queryKey({ appId });
  const query = useQuery({ ...trpc.apps.get.queryOptions({ appId }), retry: false, ...pageQuery });
  // The last state change's detail ("removed" when it was uninstalled, US-APP-12).
  const [lastChange, setLastChange] = useState<{ state: AppState; detail: string | null } | null>(null);
  useSubscription(
    trpc.events.stream.subscriptionOptions(
      { types: ['app.stateChanged', 'engine.status'] },
      {
        onData: ({ data: event }) => {
          // The engine stopping or coming back changes what every app window shows (US-APP-03).
          if (event.type === 'engine.status') {
            const engineRunning = event.data.running;
            queryClient.setQueryData<AppDetail>(key, (old) => (old ? { ...old, engineRunning } : old));
            void queryClient.invalidateQueries({ queryKey: key });
            return;
          }
          if (event.type !== 'app.stateChanged' || event.data.appId !== appId) return;
          setLastChange({ state: event.data.state, detail: event.data.detail ?? null });
          queryClient.setQueryData<AppDetail>(key, (old) => (old ? { ...old, state: event.data.state } : old));
          void queryClient.invalidateQueries({ queryKey: key });
        },
      },
    ),
  );
  return { ...query, lastChange };
}

/** The app's address for this browser: its tailnet port on the tailnet name (D-012), its .local name otherwise. */
export function appBaseUrl(app: Pick<AppDetail, 'urls'>, location: Pick<Location, 'hostname'> = window.location) {
  return location.hostname.endsWith('.ts.net') && app.urls.tailnet ? app.urls.tailnet : app.urls.local;
}
