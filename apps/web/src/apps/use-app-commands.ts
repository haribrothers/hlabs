// Start, stop and restart an app (US-APP-02…04). Each shows the state it moves the app to at once, and app.stateChanged
// takes over from there; a start or restart that ends in error says so in a toast with the way to its logs.
import type { AppDetail, AppState } from '@hlabs/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { appsCopy } from '../copy/apps';
import { showToast } from '../lib/toasts';
import { useTRPC, useTRPCClient } from '../lib/trpc';

const copy = appsCopy;

export function useAppCommands(app: Pick<AppDetail, 'id' | 'name' | 'state'> | undefined, appId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  // A start or restart is on its way: its outcome decides whether "didn't start" shows.
  const watching = useRef(false);

  const moving = (moves: Partial<Record<AppState, AppState>>, watch: boolean) => () => {
    watching.current = watch;
    queryClient.setQueryData(trpc.apps.get.queryKey({ appId }), (old) => {
      const next = old && moves[old.state];
      return old && next ? { ...old, state: next } : old;
    });
  };

  // An app that isn't responding is started again (US-APP-03).
  const start = useMutation({
    mutationFn: () => client.apps.start.mutate({ appId }),
    onSuccess: moving({ stopped: 'starting', error: 'starting' }, true),
  });
  const stop = useMutation({
    mutationFn: () => client.apps.stop.mutate({ appId }),
    onSuccess: moving({ running: 'stopping' }, false),
  });
  const restart = useMutation({
    mutationFn: () => client.apps.restart.mutate({ appId }),
    onSuccess: moving({ running: 'restarting', error: 'starting' }, true),
  });

  const state = app?.state;
  const name = app?.name;
  useEffect(() => {
    if (!watching.current || !name) return;
    if (state === 'error') {
      watching.current = false;
      showToast({
        tone: 'danger',
        title: copy.didntStart(name),
        actions: [{ kind: 'navigate', label: copy.logs, to: `/apps/${appId}/logs`, admin: true }],
      });
    } else if (state === 'running' || state === 'stopped') {
      watching.current = false;
    }
  }, [state, name, appId]);

  return { start, stop, restart, pending: start.isPending || stop.isPending || restart.isPending };
}
