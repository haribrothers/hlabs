// Reconnecting the event stream (US-STATE-18). The browser's own EventSource retry is turned off
// (ClosingEventSource) so every drop reaches `streamLink`, which reconnects after 1, 2, 4, 8 and 16 s, then every
// 30 s, each ±20%, starting over once connected. It resumes from the last event id; when the daemon can't
// (`stream.reset`), every query is refetched instead. A visible tab again reconnects at once.
import type { AppRouter, HlabsEvent } from '@hlabs/api';
import type { TRPCLink } from '@trpc/client';
import { observable, type Unsubscribable } from '@trpc/server/observable';
import { forgetStream, markStreamDown, markStreamUp, onReconnectNow } from './stream-status';

export const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;
export const BACKOFF_MAX_MS = 30_000;
export const JITTER = 0.2;

/** The wait before reconnect number `failures` (1 = the first after a drop). */
export function backoffMs(failures: number, random: () => number = Math.random): number {
  const base = BACKOFF_MS[failures - 1] ?? BACKOFF_MAX_MS;
  return Math.round(base * (1 + (random() * 2 - 1) * JITTER));
}

/** An EventSource that closes on any error, so the link (not the browser) decides when to reconnect. Built lazily:
 * there's no EventSource outside a browser (tests). */
export function closingEventSource(): typeof EventSource | undefined {
  if (typeof EventSource === 'undefined') return undefined;
  return class ClosingEventSource extends EventSource {
    constructor(url: string | URL, init?: EventSourceInit) {
      super(url, init);
      // Added first, so it runs before tRPC's listener, which then sees CLOSED and reports the error.
      this.addEventListener('error', () => {
        if (this.readyState !== EventSource.CLOSED) this.close();
      });
    }
  };
}

let nextStreamId = 1;

function withLastEventId(input: unknown, lastEventId: string): unknown {
  return { ...(typeof input === 'object' && input ? input : {}), lastEventId };
}

export function streamLink(opts: { onReset: () => void; random?: () => number }): TRPCLink<AppRouter> {
  return () =>
    ({ op, next }) =>
      observable((observer) => {
        const id = nextStreamId++;
        let lastEventId: string | null = null;
        let failures = 0;
        let current: Unsubscribable | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let closed = false;
        let attempt = 0;

        const connect = () => {
          timer = null;
          const mine = ++attempt;
          const attemptOp = lastEventId ? { ...op, input: withLastEventId(op.input, lastEventId) } : op;
          current = next(attemptOp).subscribe({
            next(envelope) {
              const result = envelope.result as { type?: string; id?: string; data?: unknown };
              if (result.type === 'started') {
                failures = 0;
                markStreamUp(id);
              }
              if ((!result.type || result.type === 'data') && result.id) lastEventId = result.id;
              if ((result.data as HlabsEvent | undefined)?.type === 'stream.reset') {
                opts.onReset();
                return;
              }
              observer.next(envelope);
            },
            error() {
              // Only the latest attempt counts, and only once.
              if (closed || mine !== attempt || timer) return;
              markStreamDown(id);
              failures++;
              timer = setTimeout(connect, backoffMs(failures, opts.random));
            },
            complete() {
              observer.complete();
            },
          });
        };

        const stopWaking = onReconnectNow(() => {
          if (closed || !timer) return;
          clearTimeout(timer);
          connect();
        });
        connect();
        return () => {
          closed = true;
          if (timer) clearTimeout(timer);
          current?.unsubscribe();
          stopWaking();
          forgetStream(id);
        };
      });
}
