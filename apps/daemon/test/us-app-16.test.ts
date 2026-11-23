// US-APP-16 · Save configuration and restart: apps.setConfig writes the .env, renders the compose file again, moves
// the address when it changed and runs `compose up`, as an `app_config` job, the app `restarting` meanwhile. Healthy:
// running on the new settings. Not healthy within its health timeout: the previous .env and compose file (and the saved
// settings) come back, the app is restarted on them and the job fails with APP_CONFIG_UNDONE.
import { appEnv, jobs as jobsTable } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoopProxyManager } from '../src/caddy/index';
import { PREVIOUS_SETTINGS_DIR } from '../src/apps/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { settingsApp } from './config-fixture';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-APP-16', () => {
  it('saving returns a job at once and the app is restarting until it is healthy again', async () => {
    const t = await settingsApp(closers);
    let open!: () => void;
    t.compose.gate = new Promise((r) => (open = r));
    const reply = await t.d.mutate('apps.setConfig', {
      appId: 'vaultwarden',
      env: [{ key: 'WEB_WORKERS', value: '6' }],
    });
    const jobId = reply.result!.data.jobId as string;
    expect(t.row().state).toBe('restarting');
    expect(t.job(jobId)?.kind).toBe('app_config');
    open();
    t.compose.gate = null;
    expect((await t.s.jobs.settled(jobId))?.state).toBe('succeeded');
    expect(t.row().state).toBe('running');
    expect(t.compose.calls.filter((c) => c.op === 'up').length).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(t.projectDir, PREVIOUS_SETTINGS_DIR))).toBe(false);
  });

  it('when the app is not healthy in time, the previous settings come back and it restarts on them', async () => {
    const t = await settingsApp(closers);
    const env = t.file('.env');
    const compose = t.file('docker-compose.yml');
    // The app doesn't answer while it runs with 99 workers.
    t.setHttp(() => (t.file('.env').includes("WEB_WORKERS='99'") ? null : 200));
    const { job } = await t.save('apps.setConfig', {
      env: [
        { key: 'WEB_WORKERS', value: '99' },
        { key: 'NEW_ONE', value: 'x' },
      ],
      hostname: 'passwords',
    });
    expect(job).toMatchObject({ state: 'failed', hlabsCode: 'APP_CONFIG_UNDONE' });
    expect(t.file('.env')).toBe(env);
    expect(t.file('docker-compose.yml')).toBe(compose);
    expect(t.row()).toMatchObject({ state: 'running', hostname: 'vaultwarden' });
    const rows = t.s.db.select().from(appEnv).all();
    expect(rows.find((r) => r.key === 'WEB_WORKERS')?.value).toBe('4');
    expect(rows.some((r) => r.key === 'NEW_ONE')).toBe(false);
    // Its old address is served again.
    expect((t.s.proxy as NoopProxyManager).last!.apps.find((a) => a.appId === 'vaultwarden')?.hostname).toBe(
      'vaultwarden',
    );
    expect(existsSync(join(t.projectDir, PREVIOUS_SETTINGS_DIR))).toBe(false);
  });

  it('a new port that turns out to be taken at start is undone and reported as APP_PORT_IN_USE', async () => {
    const t = await settingsApp(closers);
    const old = t.row().portFallback;
    const { ComposeError } = await import('../src/apps/compose');
    t.compose.fail('up', 'hlabs-vaultwarden', new ComposeError('compose up failed', 'taken', 13345));
    const { job } = await t.save('apps.setConfig', { hostPort: 12345 });
    expect(job).toMatchObject({ state: 'failed', hlabsCode: 'APP_PORT_IN_USE' });
    expect(t.row()).toMatchObject({ state: 'running', portFallback: old });
  });

  it('when the previous settings do not start it either, the app is in error', async () => {
    const t = await settingsApp(closers);
    t.setHttp(() => null);
    const { job } = await t.save('apps.setConfig', { env: [{ key: 'WEB_WORKERS', value: '5' }] });
    expect(job).toMatchObject({ state: 'failed', hlabsCode: 'APP_CONFIG_UNDONE' });
    expect(t.row().state).toBe('error');
    expect(
      t.s.db
        .select()
        .from(appEnv)
        .all()
        .find((r) => r.key === 'WEB_WORKERS')?.value,
    ).toBe('4');
  });

  it('a stopped app is started on its new settings', async () => {
    const t = await settingsApp(closers);
    await t.s.apps.stop('vaultwarden');
    const { job } = await t.save('apps.setConfig', { env: [{ key: 'WEB_WORKERS', value: '2' }] });
    expect(job?.state).toBe('succeeded');
    expect(t.row().state).toBe('running');
  });

  it('while the app is busy, or without the engine, nothing is saved', async () => {
    const t = await settingsApp(closers);
    let open!: () => void;
    t.compose.gate = new Promise((r) => (open = r));
    const first = await t.d.mutate('apps.setConfig', {
      appId: 'vaultwarden',
      env: [{ key: 'WEB_WORKERS', value: '6' }],
    });
    const second = await t.d.mutate('apps.setConfig', {
      appId: 'vaultwarden',
      env: [{ key: 'WEB_WORKERS', value: '7' }],
    });
    expect(second.error?.data.hlabsCode).toBe('APP_BUSY');
    open();
    t.compose.gate = null;
    await t.s.jobs.settled(first.result!.data.jobId as string);
    expect(t.file('.env')).toContain("WEB_WORKERS='6'");
    expect(t.s.db.select().from(jobsTable).where(eq(jobsTable.kind, 'app_config')).all()).toHaveLength(1);
  });
});
