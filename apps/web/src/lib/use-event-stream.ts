// The page's events (events.stream over SSE), shared: every listener on the page uses one connection, opened with the
// first listener and closed with the last. Browsers allow six connections per site, and each subscription of its own
// holds one for as long as it's open, so a page with a handful of them starved its ordinary requests (Start engine on
// Home waited for a free connection). The stream link reconnects it and resumes with lastEventId (US-STATE-18).
import type { HlabsEvent } from '@hlabs/api';
import type { TRPCClient } from '@trpc/client';
import type { AppRouter } from '@hlabs/api';
import { useEffect, useRef, useState } from 'react';
import { useTRPCClient } from './trpc';

export type StreamStatus = 'connecting' | 'connected' | 'reconnecting';

type Listener = { onEvent: (event: HlabsEvent) => void; onStatus: (status: StreamStatus) => void };

interface Hub {
  listeners: Set<Listener>;
  stop: (() => void) | null;
  status: StreamStatus;
  /** The last event's id: one seen again isn't passed on twice. */
  lastId: string | null;
}

const hubs = new WeakMap<TRPCClient<AppRouter>, Hub>();

function hubFor(client: TRPCClient<AppRouter>): Hub {
  let hub = hubs.get(client);
  if (!hub) {
    hub = { listeners: new Set(), stop: null, status: 'connecting', lastId: null };
    hubs.set(client, hub);
  }
  return hub;
}

function setStatus(hub: Hub, status: StreamStatus) {
  hub.status = status;
  for (const l of hub.listeners) l.onStatus(status);
}

function open(client: TRPCClient<AppRouter>, hub: Hub) {
  let repeated = false;
  let delivered = false;
  const sub = client.events.stream.subscribe(undefined, {
    onStarted: () => setStatus(hub, 'connected'),
    onData: (envelope) => {
      if (envelope.id && envelope.id === hub.lastId) {
        repeated = true;
        return;
      }
      hub.lastId = envelope.id ?? null;
      delivered = true;
      for (const l of [...hub.listeners]) l.onEvent(envelope.data);
    },
    onError: () => setStatus(hub, 'reconnecting'),
    // Ended after an event (a test's fake stream does; the app's stream link reconnects by itself instead): opened again
    // while someone listens, unless it only had the same event again. One that ended without an event (refused, such
    // as before signing in) waits for the next listener, never a loop.
    onComplete: () => {
      hub.stop = null;
      if (delivered && !repeated && hub.listeners.size)
        queueMicrotask(() => hub.listeners.size && !hub.stop && open(client, hub));
    },
  });
  hub.stop = () => sub.unsubscribe();
}

export function useEventStream(onEvent?: (event: HlabsEvent) => void) {
  const client = useTRPCClient();
  const latest = useRef(onEvent);
  useEffect(() => {
    latest.current = onEvent;
  });
  const [status, setLocalStatus] = useState<StreamStatus>(() => hubFor(client).status);
  const [last, setLast] = useState<HlabsEvent | null>(null);
  // Only the dev page shows the last event; everyone else isn't re-rendered for every event.
  const wantsLast = onEvent === undefined;

  useEffect(() => {
    const hub = hubFor(client);
    const listener: Listener = {
      onEvent: (event) => {
        latest.current?.(event);
        if (wantsLast) setLast(event);
      },
      onStatus: setLocalStatus,
    };
    hub.listeners.add(listener);
    if (!hub.stop) open(client, hub);
    return () => {
      hub.listeners.delete(listener);
      if (hub.listeners.size === 0) {
        hub.stop?.();
        hub.stop = null;
        hub.status = 'connecting';
      }
    };
  }, [client, wantsLast]);

  return { status, last };
}
