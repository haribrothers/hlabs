import { afterEach, describe, expect, it } from 'vitest';
import { canSee, EVENT_BUFFER_SIZE, EventBus, type Listener } from '../src/events/bus';
import { readSse, startDaemon } from './helpers';

const admin: Listener = { kind: 'user', userId: 'a', role: 'admin' };
const member: Listener = { kind: 'user', userId: 'm', role: 'member' };
const tray: Listener = { kind: 'tray' };

async function take<T>(it: AsyncIterable<T>, n: number): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) {
    out.push(x);
    if (out.length === n) break;
  }
  return out;
}

describe('EventBus', () => {
  it('filters by audience: members, admins and the tray see only their events', () => {
    const bus = new EventBus();
    const job = bus.emit('job.progress', { jobId: 'j', kind: 'noop', target: null, progress: 1, message: null });
    const mine = bus.emit('access.changed', { userId: 'm' }, { kind: 'user', userId: 'm' });
    const traySide = bus.emit('startup.changeRequested', { startAtLogin: true }, { kind: 'all' });
    const status = bus.emit('system.status', { state: 'ready' });

    expect(canSee(admin, job.audience)).toBe(true);
    expect(canSee(member, job.audience)).toBe(false);
    expect(canSee(member, mine.audience)).toBe(true);
    expect(canSee(admin, mine.audience)).toBe(false);
    // Tray-scoped events can't be widened by the emitter (02 §2.12).
    expect(traySide.audience).toEqual({ kind: 'tray' });
    expect(canSee(admin, traySide.audience)).toBe(false);
    expect(canSee(tray, traySide.audience)).toBe(true);
    expect(canSee(tray, status.audience)).toBe(false);
    expect(canSee(member, status.audience)).toBe(true);
  });

  it('replays buffered events after lastEventId, then continues live without duplicates', async () => {
    const bus = new EventBus();
    const first = bus.emit('system.test', { message: '1' });
    bus.emit('system.test', { message: '2' });
    bus.emit('system.test', { message: '3' });
    const controller = new AbortController();
    const stream = bus.stream({ listener: admin, lastEventId: first.id, signal: controller.signal });
    setTimeout(() => bus.emit('system.test', { message: '4' }), 10);
    const got = await take(stream, 3);
    controller.abort();
    expect(got.map((e) => (e[1] as { data: { message: string } }).data.message)).toEqual(['2', '3', '4']);
  });

  it(`keeps only the last ${EVENT_BUFFER_SIZE} events`, async () => {
    const bus = new EventBus();
    const first = bus.emit('system.test', { message: 'old' });
    // One more than the buffer holds, so an event after `first` is gone.
    for (let i = 0; i < EVENT_BUFFER_SIZE + 1; i++) bus.emit('system.test', { message: String(i) });
    const controller = new AbortController();
    const stream = bus.stream({ listener: admin, lastEventId: first.id, signal: controller.signal });
    setTimeout(() => bus.emit('system.test', { message: 'live' }), 10);
    const [reset, next] = await take(stream, 2);
    controller.abort();
    // The resume point fell out of the buffer: the client is told to refetch (US-STATE-18), then gets live events.
    expect((reset![1] as { type: string }).type).toBe('stream.reset');
    expect((next![1] as { data: { message: string } }).data.message).toBe('live');
  });

  it('stops streaming and unsubscribes when aborted', async () => {
    const bus = new EventBus();
    const controller = new AbortController();
    const iterator = bus.stream({ listener: admin, signal: controller.signal })[Symbol.asyncIterator]();
    const pending = iterator.next();
    await new Promise((r) => setTimeout(r, 5));
    expect(bus.size).toBe(1);
    controller.abort();
    expect((await pending).done).toBe(true);
    expect(bus.size).toBe(0);
  });
});

describe('events.stream over SSE', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
  });

  it('delivers a test event to a subscribed client (phase 0 done-when)', async () => {
    const d = await startDaemon();
    closers.push(d.close);
    const res = await fetch(`${d.url}/trpc/events.stream`, { headers: { accept: 'text/event-stream' } });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    setTimeout(
      () =>
        void fetch(`${d.url}/dev/emit-test-event`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'hello browser' }),
        }),
      100,
    );
    const text = await readSse(res, (t) => t.includes('hello browser'));
    expect(text).toContain('"type":"system.test"');
    expect(text).toMatch(/^id: \S+-\d+$/m);
  });

  it('refuses anonymous callers once the dev flag is off', async () => {
    const d = await startDaemon({ config: { devAnonymousAdmin: false } });
    closers.push(d.close);
    const res = await fetch(`${d.url}/trpc/events.stream`, { headers: { accept: 'text/event-stream' } });
    const text = await readSse(res, (t) => t.includes('AUTH_REQUIRED'));
    expect(text).toContain('AUTH_REQUIRED');
    expect(text).not.toContain('system.test');
  });
});
