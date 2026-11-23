// "Save and restart app" for Configuration and Permissions (US-APP-16, US-APP-18): the save returns an `app_config`
// job at once and the app goes restarting (its header says so); job.finished says how it went. Succeeded: "Saved. <App>
// restarted." (with the new address and Copy when it moved, US-APP-15). Failed: the new settings were undone, said
// inline. Checks the daemon refuses before anything changes come back as `error` for the form to place.
import type { AppDetail } from '@hlabs/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { appConfigCopy } from '../copy/app-config';
import { useTRPC } from '../lib/trpc';
import { showToast } from '../lib/toasts';
import { useEventStream } from '../lib/use-event-stream';

const copy = appConfigCopy;

export interface SaveOutcome {
  /** The job's code when it failed: APP_CONFIG_UNDONE, APP_PORT_IN_USE… */
  failed: string | null;
}

export function useSettingsSave<I>(
  app: AppDetail,
  save: (input: I) => Promise<{ jobId: string }>,
  options: {
    onDone: (outcome: SaveOutcome) => void;
    /** Refused before anything changed: the form says why where it belongs. */
    onRefused: (err: unknown) => void;
    movedTo?: () => string | null;
  },
) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const waiting = useRef<string | null>(null);
  /** Jobs that finished before their id came back. */
  const finished = useRef(new Map<string, string | null>());
  const latest = useRef(options);
  latest.current = options;

  const settle = (id: string, code: string | null) => {
    if (waiting.current !== id) return;
    waiting.current = null;
    setJobId(null);
    void queryClient.invalidateQueries({ queryKey: trpc.apps.getConfig.queryKey({ appId: app.id }) });
    void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId: app.id }) });
    if (code === null) {
      const url = latest.current.movedTo?.() ?? null;
      showToast({
        tone: 'success',
        title: copy.saved(app.name),
        ...(url
          ? {
              body: copy.nowAt(url),
              // Copies the new address (a callback toast button: never from a notification).
              actions: [
                {
                  kind: 'retry' as const,
                  label: copy.copy,
                  run: () =>
                    void navigator.clipboard.writeText(url).then(
                      () => showToast({ tone: 'success', title: copy.addressCopied }),
                      () => showToast({ tone: 'danger', title: copy.copyFailed }),
                    ),
                },
              ],
            }
          : {}),
      });
    }
    latest.current.onDone({ failed: code });
  };

  useEventStream((event) => {
    if (event.type !== 'job.finished' || event.data.kind !== 'app_config' || event.data.target !== app.id) return;
    const code = event.data.state === 'succeeded' ? null : (event.data.hlabsCode ?? 'INTERNAL');
    if (waiting.current === event.data.jobId) settle(event.data.jobId, code);
    else finished.current.set(event.data.jobId, code);
  });

  const mutation = useMutation({
    mutationFn: save,
    meta: { inlineErrors: true },
    onError: (err) => latest.current.onRefused(err),
    onSuccess: ({ jobId: id }) => {
      waiting.current = id;
      setJobId(id);
      void queryClient.invalidateQueries({ queryKey: trpc.apps.get.queryKey({ appId: app.id }) });
      if (finished.current.has(id)) settle(id, finished.current.get(id)!);
    },
  });

  return {
    save: (input: I) => mutation.mutate(input),
    /** The save was sent, or the app is restarting on it. */
    busy: mutation.isPending || jobId !== null,
    reset: () => mutation.reset(),
  };
}
