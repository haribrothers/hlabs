// Live usage data (US-USE-02): usage.current and the host's last hour, kept up to date by usage.sample events (every
// 5 s, already filtered per person by the daemon). While the tab is hidden, samples are ignored rather than buffered;
// when it shows again, usage.current is fetched once and live updates resume. With `withApps`, apps.list too (the
// per-app table, US-USE-06/07), fetched again when an app changes state, is installed or uninstalled.
import type { UsageHistory, UsageSample } from '@hlabs/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { pageQuery } from '../lib/error-copy';
import { useTRPC } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';

/** One hour at 5 s. */
const HOUR_POINTS = 720;

const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

export function useLiveUsage(opts: { withHistory?: boolean; withApps?: boolean } = {}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const currentKey = trpc.usage.current.queryKey();
  const hourInput = { scope: 'host', range: '1h' } as const;
  const hourKey = trpc.usage.history.queryKey(hourInput);
  const current = useQuery({ ...trpc.usage.current.queryOptions(), ...pageQuery, retry: false });
  const hour = useQuery({
    ...trpc.usage.history.queryOptions(hourInput),
    retry: false,
    enabled: opts.withHistory ?? false,
  });

  const apps = useQuery({ ...trpc.apps.list.queryOptions(), retry: false, enabled: opts.withApps ?? false });

  useEventStream((event) => {
    if (event.type === 'app.stateChanged' && opts.withApps) {
      void queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
      return;
    }
    if (event.type !== 'usage.sample' || !visible()) return;
    const sample: UsageSample = event.data;
    queryClient.setQueryData(currentKey, sample);
    queryClient.setQueryData(hourKey, (old: UsageHistory | undefined) =>
      old ? { ...old, points: [...old.points, { ts: sample.ts, ...sample.host }].slice(-HOUR_POINTS) } : old,
    );
  });

  useEffect(() => {
    const onVisible = () => {
      if (visible()) void queryClient.invalidateQueries({ queryKey: currentKey });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [queryClient, currentKey]);

  return { current, hour, apps };
}
