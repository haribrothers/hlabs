// US-SYS-27 · View hlabs logs (server side): system.logs gives the last lines of the background service, the proxy
// or app installs (newest file first, oldest line first), only lines after `since` when asked, with tokens, passwords
// and Authorization headers masked as ••••; admins only; nothing when there are no lines. App jobs write the
// installs log.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { InstallsLog } from '../src/system/installs-log';
import { readSystemLogs } from '../src/system/logs';
import { MASK, maskSecrets } from '../src/system/redact';
import { EventBus } from '../src/events/bus';
import { daemonWithAdmin, type Reply } from './admin-session';
import { tempDir } from './helpers';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const pino = (time: number, msg: string, extra: Record<string, unknown> = {}, level = 30) =>
  JSON.stringify({ level, time, v: '0.0.0', msg, ...extra });

function daemonLogs(dataDir: string) {
  mkdirSync(join(dataDir, 'logs'), { recursive: true });
  // pino-roll: hlabsd.1.log is older than hlabsd.2.log.
  writeFileSync(join(dataDir, 'logs', 'hlabsd.1.log'), `${pino(1000, 'old one')}\n${pino(2000, 'old two')}\n`);
  writeFileSync(
    join(dataDir, 'logs', 'hlabsd.2.log'),
    [
      pino(3000, 'request', { req: { headers: { authorization: 'Bearer abc.def.ghi' } } }),
      pino(4000, 'login failed', { password: 'hunter2hunter2' }, 40),
      'not json at all',
      pino(5000, 'job failed', { err: { type: 'Error', message: 'boom', stack: 'at x' } }, 50),
    ].join('\n') + '\n',
  );
}

describe('US-SYS-27', () => {
  it('reads the newest lines first across files, oldest first in the answer, levels and errors in words', () => {
    const dataDir = tempDir();
    daemonLogs(dataDir);
    const lines = readSystemLogs(dataDir, 'daemon', { limit: 500 });
    expect(lines.map((l) => l.at)).toEqual([1000, 2000, 3000, 4000, 5000]);
    expect(lines.map((l) => l.level)).toEqual(['info', 'info', 'info', 'warn', 'error']);
    expect(lines[4]!.text).toBe('job failed err=boom');
    expect(readSystemLogs(dataDir, 'daemon', { limit: 2 }).map((l) => l.at)).toEqual([4000, 5000]);
    expect(readSystemLogs(dataDir, 'daemon', { limit: 500, since: 3000 }).map((l) => l.at)).toEqual([4000, 5000]);
  });

  it('masks tokens, passwords, cookies and Authorization headers as ••••', () => {
    const dataDir = tempDir();
    daemonLogs(dataDir);
    const text = readSystemLogs(dataDir, 'daemon', { limit: 500 })
      .map((l) => l.text)
      .join('\n');
    expect(text).not.toContain('abc.def.ghi');
    expect(text).not.toContain('hunter2hunter2');
    expect(text).toContain(MASK);
    for (const [secret, raw] of [
      ['s3cret-value', 'Authorization: Basic s3cret-value'],
      ['tok123456', 'GET /api?token=tok123456&x=1'],
      ['cookie-value', 'cookie: hlabs_session=cookie-value'],
      ['pa55word', 'DB_PASSWORD=pa55word'],
      ['pa55word', 'connecting to postgres://hlabs:pa55word@db:5432/x'],
      ['tskey-auth-abcdef123456', 'using tskey-auth-abcdef123456'],
      ['xyz987', '{"apiKey":"xyz987"}'],
    ] as const) {
      const masked = maskSecrets(raw);
      expect(masked, raw).not.toContain(secret);
      expect(masked, raw).toContain(MASK);
    }
    expect(maskSecrets('Immich is ready on port 2283')).toBe('Immich is ready on port 2283');
  });

  it('reads the proxy log (Caddy) and the installs log written from app jobs', () => {
    const dataDir = tempDir();
    mkdirSync(join(dataDir, 'caddy'), { recursive: true });
    writeFileSync(
      join(dataDir, 'caddy', 'caddy.log'),
      `${JSON.stringify({ level: 'error', ts: 1.5, logger: 'http.log', msg: 'dial failed', request: { headers: { Cookie: ['hlabs_session=raw'] } } })}\n`,
    );
    const [line] = readSystemLogs(dataDir, 'proxy', { limit: 500 });
    expect(line).toMatchObject({ at: 1500, level: 'error' });
    expect(line!.text).toContain('[http.log] dial failed');
    expect(line!.text).not.toContain('hlabs_session=raw');

    const bus = new EventBus();
    new InstallsLog(dataDir).attach(bus);
    const job = { jobId: 'J1', kind: 'app_install' as const, target: 'immich' };
    bus.emit('job.progress', { ...job, progress: 0, message: null });
    bus.emit('job.progress', { ...job, progress: 10, message: 'Pulling images' });
    bus.emit('job.progress', { ...job, progress: 20, message: 'Pulling images' });
    bus.emit('job.finished', { ...job, state: 'failed', hlabsCode: 'INTERNAL' });
    bus.emit('job.finished', { jobId: 'J2', kind: 'backup', target: null, state: 'succeeded', hlabsCode: null });
    const installs = readSystemLogs(dataDir, 'installs', { limit: 500 });
    expect(installs.map((l) => [l.level, l.text.split(' jobId=')[0]])).toEqual([
      ['info', 'Installing immich started'],
      ['info', 'Installing immich: Pulling images'],
      ['error', 'Installing immich failed'],
    ]);
  });

  it('system.logs answers admins, with nothing when there are no lines; members are refused', async () => {
    const d = await daemonWithAdmin(closers);
    const reply = (await d.query('system.logs', { source: 'proxy' })) as Reply;
    expect(reply.result?.data).toEqual({ lines: [] });
    daemonLogs(d.config.paths.dataDir);
    const daemon = (await d.query('system.logs', { source: 'daemon', limit: 2 })) as Reply;
    expect((daemon.result?.data.lines as unknown[]).length).toBe(2);
    const anu = await memberSession(d);
    expect((await anu.query('system.logs', { source: 'daemon' })).error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });
});
