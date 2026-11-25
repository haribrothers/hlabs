// Public access changes are jobs (`public_on`, `public_off`, `public_off_all`, `public_setup`, `public_remove`): the
// dashboard follows the one it started until it ends, and keeps every list current from `app.publicChanged` and
// `public.statusChanged` (US-SYS-43, 44, US-APP-27).
import type { AppRouter, Job } from '@hlabs/api';
import { useQueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import { useTRPC } from '../lib/trpc';
import { useEventStream } from '../lib/use-event-stream';

/** How often to ask how a job is doing (events usually come first). */
export const JOB_POLL_MS = 1_000;
/** Stop waiting after this long; the lists still update from events. */
const JOB_WAIT_MS = 5 * 60_000;

const ENDED = new Set<Job['state']>(['succeeded', 'failed', 'cancelled']);

/** Resolves with the job once it has ended (or null when it's gone or takes too long). */
export async function followJob(client: TRPCClient<AppRouter>, jobId: string): Promise<Job | null> {
  const until = Date.now() + JOB_WAIT_MS;
  for (;;) {
    const job = await client.jobs.get.query({ jobId }).catch(() => null);
    if (!job) return null;
    if (ENDED.has(job.state)) return job;
    if (Date.now() > until) return null;
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
  }
}

/** Keeps public access, the app lists and an app's settings current while public access changes anywhere. */
export function usePublicRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.public.status.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.apps.list.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.apps.publicOptions.queryKey() });
  };
  useEventStream((event) => {
    if (event.type === 'app.publicChanged' || event.type === 'public.statusChanged') refresh();
    else if (event.type === 'job.finished' && event.data.kind.startsWith('public_')) refresh();
  });
  return refresh;
}
