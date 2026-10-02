// US-APP-08 · Follow an app's logs live: Docker's log frames as lines, the last lines across containers oldest first,
// new lines as they come, a divider when a container restarts while followed, and admins only.
import type { LogLine } from '@hlabs/api';
import { ulid } from '@hlabs/shared';
import { users } from '@hlabs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogs } from '../src/apps/logs';
import { LogFrames } from '../src/engine/log-frames';
import type { ContainerState } from '../src/engine/types';
import { FakeEngine } from './fakes/engine';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** A multiplexed frame: stream 1 stdout, 2 stderr. */
const frame = (stream: 1 | 2, text: string) => {
  const body = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
};

const container = (id: string, service: string, over: Partial<ContainerState> = {}): ContainerState => ({
  id,
  service,
  state: 'running',
  health: null,
  image: service,
  imageId: `sha256:${service}`,
  startedAt: 1,
  exitCode: null,
  ...over,
});

function twoServices() {
  const engine = new FakeEngine();
  engine.containers.set('hlabs-immich', [container('c-server', 'server'), container('c-db', 'database')]);
  const logs = new AppLogs({ engine: { client: engine }, project: (id) => `hlabs-${id}`, reattachMs: 5 });
  return { engine, logs };
}

/** Reads what a watch yields until `count` lines have arrived. */
async function take(iter: AsyncGenerator<LogLine>, count: number): Promise<LogLine[]> {
  const out: LogLine[] = [];
  for await (const line of iter) {
    out.push(line);
    if (out.length === count) break;
  }
  return out;
}

describe('US-APP-08', () => {
  it('reads multiplexed frames into timed lines, even when a line spans frames', () => {
    const frames = new LogFrames(false);
    const both = Buffer.concat([
      frame(1, '2024-05-01T17:02:11.123456789Z Starting server\n2024-05-01T17:02:12.000000000Z Web '),
      frame(2, '2024-05-01T17:02:12.500000000Z oops\r\n'),
    ]);
    // Split mid-header, the way chunks arrive.
    const first = frames.push(both.subarray(0, 5));
    const rest = frames.push(both.subarray(5));
    expect(first).toEqual([]);
    expect(rest).toEqual([
      { stream: 'stdout', ts: Date.parse('2024-05-01T17:02:11.123Z'), line: 'Starting server' },
      { stream: 'stderr', ts: Date.parse('2024-05-01T17:02:12.500Z'), line: 'oops' },
    ]);
    frames.push(frame(1, 'vault enabled\n'));
    expect(frames.flush()).toEqual([]);
  });

  it('a container with a terminal sends plain text, all of it stdout', () => {
    const frames = new LogFrames(true);
    expect(frames.push(Buffer.from('2024-05-01T17:02:11Z hello\n2024-05-01T17:02:12Z wor'))).toEqual([
      { stream: 'stdout', ts: Date.parse('2024-05-01T17:02:11Z'), line: 'hello' },
    ]);
    expect(frames.flush()).toEqual([{ stream: 'stdout', ts: Date.parse('2024-05-01T17:02:12Z'), line: 'wor' }]);
  });

  it('the last lines across all containers, oldest first, each with its service', async () => {
    const { engine, logs } = twoServices();
    engine.addLog('c-server', { stream: 'stdout', ts: 10, line: 'server up' });
    engine.addLog('c-db', { stream: 'stdout', ts: 5, line: 'db up' });
    engine.addLog('c-server', { stream: 'stderr', ts: 20, line: 'warn' });
    expect(await logs.recent('immich', { tail: 500 })).toEqual([
      { service: 'database', stream: 'stdout', ts: 5, line: 'db up' },
      { service: 'server', stream: 'stdout', ts: 10, line: 'server up' },
      { service: 'server', stream: 'stderr', ts: 20, line: 'warn' },
    ]);
    expect((await logs.recent('immich', { tail: 2 })).map((l) => l.line)).toEqual(['server up', 'warn']);
  });

  it('following gives only new lines, as they come', async () => {
    const { engine, logs } = twoServices();
    engine.addLog('c-server', { stream: 'stdout', ts: 1, line: 'old' });
    const controller = new AbortController();
    const got = take(logs.watch('immich', {}, controller.signal), 2);
    await vi.waitFor(() => expect(engine.following('c-db') + engine.following('c-server')).toBe(2));
    engine.addLog('c-db', { stream: 'stdout', ts: 30, line: 'db new' });
    engine.addLog('c-server', { stream: 'stdout', ts: 31, line: 'server new' });
    expect((await got).map((l) => l.line).sort()).toEqual(['db new', 'server new']);
    controller.abort();
  });

  it('after `since`, it carries on from the initial load', async () => {
    const { engine, logs } = twoServices();
    engine.addLog('c-server', { stream: 'stdout', ts: 1, line: 'loaded already' });
    engine.addLog('c-server', { stream: 'stdout', ts: 2, line: 'after the load' });
    const controller = new AbortController();
    const [line] = await take(logs.watch('immich', { service: 'server', since: 1 }, controller.signal), 1);
    expect(line).toMatchObject({ service: 'server', line: 'after the load' });
    controller.abort();
  });

  it('a container restarting while followed is picked up again, after a "restarted" line', async () => {
    const { engine, logs } = twoServices();
    const controller = new AbortController();
    const got = take(logs.watch('immich', { service: 'server' }, controller.signal), 3);
    await vi.waitFor(() => expect(engine.following('c-server')).toBe(1));
    const now = Date.now();
    engine.addLog('c-server', { stream: 'stdout', ts: now, line: 'before' });
    // It stops and starts again.
    engine.setService('hlabs-immich', 'server', { startedAt: 2 });
    engine.endLogs('c-server');
    await vi.waitFor(() => expect(engine.followCount.get('c-server')).toBe(2));
    engine.addLog('c-server', { stream: 'stdout', ts: now + 10, line: 'after' });
    const lines = await got;
    expect(lines.map((l) => (l.restarted ? '— restarted —' : l.line))).toEqual(['before', '— restarted —', 'after']);
    controller.abort();
  });

  it('apps.logs needs an admin: logs can hold secrets', async () => {
    const t = await installDaemon(closers);
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as {
      result: { data: { jobId: string } };
    };
    await t.s.jobs.settled(res.result.data.jobId);
    const input = encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }));
    const admin = (await t.d.query(`apps.logs?input=${input}`)) as { result?: { data: { lines: unknown[] } } };
    expect(admin.result?.data.lines).toEqual([]);
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${t.s.sessions.create({ userId: member }).raw}`;
    const denied = (await (
      await fetch(`${t.d.url}/trpc/apps.logs?input=${input}`, { headers: { cookie } })
    ).json()) as {
      error?: { data: { hlabsCode: string } };
    };
    expect(denied.error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
