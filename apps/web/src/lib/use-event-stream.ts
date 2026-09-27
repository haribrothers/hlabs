// Subscribes to events.stream (SSE). The client resumes with lastEventId after a reconnect.
import type { HlabsEvent } from '@hlabs/api';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import { useTRPC } from './trpc';

export type StreamStatus = 'connecting' | 'connected' | 'reconnecting';

export function useEventStream(onEvent?: (event: HlabsEvent) => void) {
  const trpc = useTRPC();
  const [last, setLast] = useState<HlabsEvent | null>(null);
  const sub = useSubscription(
    trpc.events.stream.subscriptionOptions(undefined, {
      onData: (envelope) => {
        setLast(envelope.data);
        onEvent?.(envelope.data);
      },
    }),
  );
  const status: StreamStatus =
    sub.status === 'pending'
      ? 'connected'
      : sub.status === 'connecting' || sub.status === 'idle'
        ? 'connecting'
        : 'reconnecting';
  return { status, last };
}
