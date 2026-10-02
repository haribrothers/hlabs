// US-INST-12 · Container engine stopped: tray.startEngine runs the same engine_start job as the dashboard, audited as
// from the tray; tray.diagnostics gives a redacted plain-text report; Start engine isn't offered for Docker Engine.
import { auditLog } from '@hlabs/db';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { diagnosticsReport, newestLog, redactSecrets } from '../src/tray/diagnostics';
import { trayStatus } from '../src/tray/status';
import { FakeEngineControl } from './fakes/engine-control';
import { startDaemon, tempDir } from './helpers';

const TOKEN = newTrayToken();

async function call(url: string, path: string, method: 'GET' | 'POST' = 'GET') {
  // A mutation without input in tRPC's batch form, as the tray sends it.
  const res =
    method === 'POST'
      ? await fetch(`${url}/trpc/${path}?batch=1`, {
          method,
          headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
          body: '{}',
        })
      : await fetch(`${url}/trpc/${path}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const json = (await res.json()) as unknown;
  const body = (Array.isArray(json) ? json[0] : json) as {
    result?: { data: Record<string, unknown> };
    error?: unknown;
  };
  if (!body.result) throw new Error(`${path}: ${JSON.stringify(body.error)}`);
  return body.result.data;
}

describe('US-INST-12 · Container engine stopped', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('Start engine runs the engine_start job, audited as from the tray; a second press gets the same job', async () => {
    const control = new FakeEngineControl();
    const d = await startDaemon({
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
      boot: { engineControl: control },
    });
    close = d.close;
    await d.services!.reconciled;
    d.engine.running = false;
    await d.services!.engine.check();
    expect((await trayStatus(d.services!)).state).toBe('engineStopped');
    let started!: () => void;
    const starting = new Promise<void>((resolve) => (started = resolve));
    control.onStart = async () => {
      await starting;
      d.engine.running = true;
    };

    const first = (await call(d.url, 'tray.startEngine', 'POST')) as { jobId: string };
    const second = (await call(d.url, 'tray.startEngine', 'POST')) as { jobId: string };
    expect(second.jobId).toBe(first.jobId);
    started();
    await d.services!.jobs.settled(first.jobId);

    expect(d.services!.engine.status.state).toBe('running');
    const audit = d
      .services!.db.select()
      .from(auditLog)
      .all()
      .find((r) => r.action === 'engine.start');
    expect(audit).toMatchObject({ userId: null, detailJson: { via: 'tray' } });
  });

  it("doesn't offer Start engine for Docker Engine on Linux", async () => {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    close = d.close;
    expect((await trayStatus(d.services!)).engine.canStart).toBe(true);
    const services = {
      ...d.services!,
      engine: {
        status: { state: 'stopped', candidate: { kind: 'docker-engine', socketPath: '/x', managedByHlabs: false } },
      },
    } as never;
    expect((await trayStatus(services)).engine).toMatchObject({ name: 'docker-engine', canStart: false });
  });

  it('Copy diagnostics: versions, engine, health and the last 200 log lines, with secrets removed', async () => {
    const d = await startDaemon({ trayTokens: new TrayTokens({ read: async () => TOKEN }) });
    close = d.close;
    const logs = join(d.config.paths.dataDir, 'logs');
    mkdirSync(logs, { recursive: true });
    writeFileSync(join(logs, 'hlabsd.1.log'), 'old file\n');
    const lines = Array.from({ length: 250 }, (_, i) => `{"msg":"line ${i}"}`);
    lines.push('{"req":{"headers":{"authorization":"Bearer abc.def-123"}},"msg":"tray call"}');
    lines.push('{"msg":"open http://127.0.0.1:7474/setup?token=SECRET123"}');
    lines.push('{"password":"hunter2","msg":"x"}');
    writeFileSync(join(logs, 'hlabsd.2.log'), `${lines.join('\n')}\n`);

    const { report } = (await call(d.url, 'tray.diagnostics')) as { report: string };
    expect(report).toContain('hlabs: 0.0.0-test');
    expect(report).toContain('Container engine: orbstack, running');
    expect(report).toContain('Health: ready');
    expect(report).not.toContain('old file');
    expect(report).not.toContain('line 52"');
    expect(report).toContain('line 249');
    expect(report).not.toContain('abc.def-123');
    expect(report).not.toContain('SECRET123');
    expect(report).not.toContain('hunter2');
    const logPart = report.split('Last 200 lines of the hlabs log:\n')[1]!;
    expect(logPart.split('\n')).toHaveLength(200);
  });

  it('redacts Bearer values, tokens in addresses, passwords and session cookies', () => {
    expect(redactSecrets('Authorization: Bearer abcDEF123_-.~+/=')).toBe('Authorization: Bearer [redacted]');
    expect(redactSecrets('https://x/invite?token=abc&x=1')).toBe('https://x/invite?token=[redacted]&x=1');
    expect(redactSecrets('{"newPassword":"p","totpSecret":"s"}')).toBe(
      '{"newPassword":"[redacted]","totpSecret":"[redacted]"}',
    );
    expect(redactSecrets('cookie: hlabs_session=abc; other=1')).toBe('cookie: hlabs_session=[redacted]; other=1');
  });

  it('reads no log when there is none', () => {
    expect(newestLog(join(tempDir(), 'logs'))).toBeNull();
    const report = diagnosticsReport({
      config: { version: '1', paths: { dataDir: tempDir() }, headless: false } as never,
      engine: { status: { state: 'missing' } },
      readiness: { isReady: false },
    });
    expect(report).toContain('Container engine: none found');
    expect(report).toContain('Health: not ready');
  });
});
