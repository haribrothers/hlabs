// US-STORE-14 · Retry or remove a failed install.
import { apps, auditLog } from '@hlabs/db';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ComposeError } from '../src/apps/compose';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, any> }; error?: { data: { hlabsCode: string } } }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function failedInstall(t: Awaited<ReturnType<typeof installDaemon>>) {
  t.compose.fail('up', 'hlabs-uptime-kuma', new ComposeError('up failed', 'port is already allocated', 12000));
  const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
  await t.s.jobs.settled(res.result!.data.jobId);
  expect(t.s.db.select().from(apps).get()?.state).toBe('install_failed');
}

describe('US-STORE-14', () => {
  it('retries install_failed → installing → running, reusing the images already downloaded', async () => {
    const t = await installDaemon(closers);
    await failedInstall(t);
    const pulls = t.engine.pulls.length;
    const res = (await t.d.mutate('apps.retryInstall', { appId: 'uptime-kuma' })) as Reply;
    const job = await t.s.jobs.settled(res.result!.data.jobId);
    expect(job?.state).toBe('succeeded');
    expect(t.s.db.select().from(apps).get()?.state).toBe('running');
    expect(t.engine.pulls.length).toBe(pulls);
  });

  it('"Use a different port" retries on the port chosen, which must be free and in 12000–12999', async () => {
    // 12001's loopback port (D-086) is taken.
    const t = await installDaemon(closers, { busyPorts: [13001] });
    await failedInstall(t);
    const busy = (await t.d.mutate('apps.retryInstall', {
      appId: 'uptime-kuma',
      portOverrides: { web: 12001 },
    })) as Reply;
    expect(busy.error?.data.hlabsCode).toBe('APP_PORT_IN_USE');
    const res = (await t.d.mutate('apps.retryInstall', {
      appId: 'uptime-kuma',
      portOverrides: { web: 12002 },
    })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId);
    expect(t.s.db.select().from(apps).get()).toMatchObject({ state: 'running', portFallback: 12002 });
  });

  it('only a failed install can be retried', async () => {
    const t = await installDaemon(closers);
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId);
    expect(((await t.d.mutate('apps.retryInstall', { appId: 'uptime-kuma' })) as Reply).error?.data.hlabsCode).toBe(
      'APP_BUSY',
    );
  });

  it('"Remove partial install" takes down the stack and deletes app data, never the folders people chose', async () => {
    const t = await installDaemon(closers);
    const photos = join(t.root, 'users', 'hari', 'Photos');
    mkdirSync(photos, { recursive: true });
    writeFileSync(join(photos, 'keep.jpg'), 'x');
    await failedInstall(t);
    const appData = join(t.s.config.paths.appDataDir, 'uptime-kuma');
    expect(existsSync(appData)).toBe(true);
    const res = (await t.d.mutate('apps.uninstall', { appId: 'uptime-kuma', keepData: false })) as Reply;
    await t.s.jobs.settled(res.result!.data.jobId);
    expect(t.s.db.select().from(apps).all()).toEqual([]);
    expect(existsSync(appData)).toBe(false);
    expect(existsSync(join(t.s.config.paths.dataDir, 'apps', 'uptime-kuma'))).toBe(false);
    expect(existsSync(join(photos, 'keep.jpg'))).toBe(true);
    expect(t.compose.calls.at(-1)).toEqual({ op: 'down', project: 'hlabs-uptime-kuma' });
    expect(
      t.s.db
        .select()
        .from(auditLog)
        .all()
        .some((a) => a.action === 'app.install.remove'),
    ).toBe(true);
    // Back to "Install" in the store.
    const d = (await t.d.query(
      `store.getApp?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`,
    )) as Reply;
    expect(d.result!.data.app.installed).toBe(false);
  });
});
