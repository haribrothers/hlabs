// US-STATE-18 · Resuming the event stream (server side): replay from lastEventId, or `stream.reset` when that
// isn't possible, so the client refetches.
import { describe, expect, it } from 'vitest';
import { EventBus, type Listener } from '../src/events/bus';

const admin: Listener = { kind: 'user', userId: 'a', role: 'admin' };

async function firstOf(bus: EventBus, lastEventId: string | null, emitLive = true) {
  const controller = new AbortController();
  const stream = bus.stream({ listener: admin, lastEventId, signal: controller.signal });
  if (emitLive) setTimeout(() => bus.emit('system.test', { message: 'live' }), 5);
  const got: Array<[string, { type: string; data: unknown }]> = [];
  for await (const envelope of stream) {
    got.push(envelope as never);
    if ((envelope[1] as { type: string; data: { message?: string } }).data?.message === 'live') break;
  }
  controller.abort();
  return got;
}

describe('US-STATE-18', () => {
  it('resumes after the last event the client got, including when that was the newest one', async () => {
    const bus = new EventBus();
    const a = bus.emit('system.test', { message: 'a' });
    const b = bus.emit('system.test', { message: 'b' });
    expect((await firstOf(bus, a.id)).map(([, e]) => (e.data as { message: string }).message)).toEqual(['b', 'live']);
    expect((await firstOf(bus, b.id.replace(/-\d+$/, '-3'))).map(([, e]) => e.type)).toEqual(['system.test']);
  });

  it('says stream.reset when it cannot resume: another boot, or events since then have gone', async () => {
    const restarted = new EventBus();
    restarted.emit('system.test', { message: 'x' });
    const fromOldBoot = await firstOf(restarted, '01OLDBOOT00000000000000000-7');
    expect(fromOldBoot.map(([, e]) => e.type)).toEqual(['stream.reset', 'system.test']);

    const bus = new EventBus();
    const first = bus.emit('system.test', { message: 'first' });
    for (let i = 0; i < 600; i++) bus.emit('system.test', { message: String(i) });
    const [reset] = await firstOf(bus, first.id);
    expect(reset![1].type).toBe('stream.reset');
    // The reset carries an id the client can resume from next time.
    const again = await firstOf(bus, reset![0]);
    expect(again.map(([, e]) => e.type)).toEqual(['system.test']);
  });

  it('a first connection (no lastEventId) gets neither a replay nor a reset', async () => {
    const bus = new EventBus();
    bus.emit('system.test', { message: 'old' });
    expect((await firstOf(bus, null)).map(([, e]) => (e.data as { message: string }).message)).toEqual(['live']);
  });
});
