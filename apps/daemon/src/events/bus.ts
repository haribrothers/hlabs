// The typed event bus (02 §2.12). Keeps the last 500 events so SSE clients can resume with lastEventId.
import { TRAY_EVENTS, type EventAudience, type EventOf, type EventType, type HlabsEvent } from '@hlabs/api';
import { ulid } from '@hlabs/shared';
import { tracked, type TrackedEnvelope } from '@trpc/server';

export const EVENT_BUFFER_SIZE = 500;

export interface BusEntry {
  /** `<bootId>-<seq>`: unique across restarts, ordered within one. */
  id: string;
  seq: number;
  audience: EventAudience;
  event: HlabsEvent;
}

/** Who is listening; decides which audiences they may see. */
export type Listener =
  { kind: 'user'; userId: string; role: 'admin' | 'member'; sessionId?: string } | { kind: 'tray' };

/** Default audience per event type when the emitter doesn't give one. */
const DEFAULT_AUDIENCE: Partial<Record<EventType, EventAudience>> = {
  'system.status': { kind: 'all' },
  'engine.status': { kind: 'all' },
  'system.test': { kind: 'all' },
};

export function audienceFor(type: EventType, audience?: EventAudience): EventAudience {
  if (TRAY_EVENTS.has(type)) return { kind: 'tray' };
  return audience ?? DEFAULT_AUDIENCE[type] ?? { kind: 'admins' };
}

export function canSee(listener: Listener, audience: EventAudience): boolean {
  if (listener.kind === 'tray') return audience.kind === 'tray';
  switch (audience.kind) {
    case 'all':
      return true;
    case 'admins':
      return listener.role === 'admin';
    case 'user':
      return audience.userId === listener.userId;
    case 'session':
      return audience.sessionId === listener.sessionId;
    case 'tray':
      return false;
  }
}

export interface StreamOptions {
  listener: Listener;
  lastEventId?: string | null;
  types?: readonly EventType[];
  signal?: AbortSignal;
}

export class EventBus {
  private readonly bootId = ulid();
  private seq = 0;
  private readonly buffer: BusEntry[] = [];
  private readonly subscribers = new Set<(entry: BusEntry) => void>();

  emit<T extends EventType>(type: T, data: EventOf<T>['data'], audience?: EventAudience): BusEntry {
    const seq = ++this.seq;
    const entry: BusEntry = {
      id: `${this.bootId}-${seq}`,
      seq,
      audience: audienceFor(type, audience),
      event: { type, at: Date.now(), data } as HlabsEvent,
    };
    this.buffer.push(entry);
    if (this.buffer.length > EVENT_BUFFER_SIZE) this.buffer.shift();
    for (const fn of this.subscribers) fn(entry);
    return entry;
  }

  /** In-process subscription (services, tests). Returns an unsubscribe function. */
  on(fn: (entry: BusEntry) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  get size(): number {
    return this.subscribers.size;
  }

  /** The seq to resume after, or null when that isn't possible (another boot, or events since then were dropped). */
  private resumeAfter(lastEventId: string): number | null {
    const dash = lastEventId.lastIndexOf('-');
    const seq = Number(lastEventId.slice(dash + 1));
    if (lastEventId.slice(0, dash) !== this.bootId || !Number.isInteger(seq) || seq < 0 || seq > this.seq) return null;
    const oldest = this.buffer[0]?.seq ?? this.seq + 1;
    return seq >= oldest - 1 ? seq : null;
  }

  /** Buffered replay after lastEventId (or `stream.reset` when it can't), then live events, filtered for the
   * listener. */
  async *stream(options: StreamOptions): AsyncGenerator<TrackedEnvelope<HlabsEvent>> {
    const { listener, lastEventId, types, signal } = options;
    const accept = (e: BusEntry) => canSee(listener, e.audience) && (!types || types.includes(e.event.type));
    const queue: BusEntry[] = [];
    let wake: (() => void) | null = null;
    const off = this.on((entry) => {
      if (!accept(entry)) return;
      queue.push(entry);
      wake?.();
    });
    const onAbort = () => wake?.();
    signal?.addEventListener('abort', onAbort);
    // Events up to here come from the buffer; later ones arrive through the queue.
    const replayUpTo = this.seq;
    try {
      if (lastEventId) {
        const after = this.resumeAfter(lastEventId);
        if (after === null) {
          // The client missed events we no longer have: it refetches everything instead.
          yield tracked(`${this.bootId}-${replayUpTo}`, {
            type: 'stream.reset',
            at: Date.now(),
            data: {},
          } as HlabsEvent);
        } else {
          for (const entry of this.buffer) {
            if (entry.seq <= after) continue;
            if (entry.seq > replayUpTo) break;
            if (accept(entry)) yield tracked(entry.id, entry.event);
          }
        }
      }
      while (!signal?.aborted) {
        const next = queue.shift();
        if (next) {
          yield tracked(next.id, next.event);
          continue;
        }
        await new Promise<void>((resolve) => (wake = resolve));
        wake = null;
      }
    } finally {
      off();
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
