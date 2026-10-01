// US-APP-10 · Download logs: GET /api/apps/:appId/logs/download gives every kept line as a plain-text file named
// <appId>-logs-<YYYYMMDD-HHmm>.log, for one container or all of them merged by time with the service first; admins
// only.
import { users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { logFileName } from '../src/http/app-logs';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> } };
const T = Date.parse('2026-01-02T17:02:11.000Z');

async function withLogs() {
  const t = await installDaemon(closers);
  const res = (await t.d.mutate('apps.install', {
    appId: 'immich',
    mounts: [{ target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos', mode: 'rw' }],
  })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId as string);
  const containers = [...t.engine.containers.values()][0]!;
  const server = containers.find((c) => c.service === 'immich-server')!;
  const other = containers.find((c) => c.service !== 'immich-server')!;
  t.engine.addLog(server.id, { stream: 'stdout', ts: T, line: 'server one' });
  t.engine.addLog(other.id, { stream: 'stdout', ts: T + 1000, line: 'other one' });
  t.engine.addLog(server.id, { stream: 'stderr', ts: T + 2000, line: 'server two' });
  const download = (query = '', cookie = t.d.cookie) =>
    fetch(`${t.d.url}/api/apps/immich/logs/download${query}`, { headers: { cookie } });
  return { ...t, other, download };
}

describe('US-APP-10', () => {
  it('all containers: every line merged by time, each starting with its service', async () => {
    const t = await withLogs();
    const res = await t.download();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="immich-logs-\d{8}-\d{4}\.log"$/);
    expect(await res.text()).toBe(
      [
        'immich-server 2026-01-02T17:02:11.000Z server one',
        `${t.other.service} 2026-01-02T17:02:12.000Z other one`,
        'immich-server 2026-01-02T17:02:13.000Z server two',
        '',
      ].join('\n'),
    );
  });

  it('one container: its lines only, without the prefix', async () => {
    const t = await withLogs();
    const res = await t.download('?service=immich-server');
    expect(await res.text()).toBe('2026-01-02T17:02:11.000Z server one\n2026-01-02T17:02:13.000Z server two\n');
  });

  it('members get 403 and the signed-out 401', async () => {
    const t = await withLogs();
    const member = ulid();
    t.s.db
      .insert(users)
      .values({ id: member, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const cookie = `hlabs_session=${t.s.sessions.create({ userId: member }).raw}`;
    expect((await t.download('', cookie)).status).toBe(403);
    expect((await t.download('', '')).status).toBe(401);
  });

  it('the file is named after the app and the local time', () => {
    expect(logFileName('immich', new Date(2026, 9, 1, 7, 5))).toBe('immich-logs-20261001-0705.log');
  });
});
