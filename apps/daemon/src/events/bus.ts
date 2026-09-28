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

  /** Buffered replay after lastEventId, then live events, filtered for the listener. */
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
        const idx = this.buffer.findIndex((e) => e.id === lastEventId);
        if (idx >= 0) {
          for (const entry of this.buffer.slice(idx + 1)) {
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
