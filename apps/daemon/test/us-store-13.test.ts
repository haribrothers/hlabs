// US-STORE-13 · Understand why an install failed: each failure's code, values and step, and the critical notice.
import { apps, notifications } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { ComposeError } from '../src/apps/compose';
import { classifyPullError } from '../src/apps/install';
import { fakeProbes, installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function failed(t: Awaited<ReturnType<typeof installDaemon>>, appId = 'uptime-kuma') {
  const res = (await t.d.mutate('apps.install', { appId })) as Reply;
  const job = await t.s.jobs.settled(res.result!.data.jobId);
  const app = t.s.db.select().from(apps).get()!;
  return { job, app, detail: JSON.parse(app.stateDetail ?? '{}') as Record<string, unknown> };
}

describe('US-STORE-13', () => {
  it('no image for this computer: APP_NO_PLATFORM at the compatibility check', async () => {
    const t = await installDaemon(closers, { amd64Only: ['uptime-kuma'], host: { os: 'macos', arm64: true } });
    const f = await failed(t);
    expect(f.job).toMatchObject({ state: 'failed', hlabsCode: 'APP_NO_PLATFORM' });
    expect(f.app.state).toBe('install_failed');
    expect(f.detail).toMatchObject({ code: 'APP_NO_PLATFORM', step: 'check', arch: 'arm64' });
    expect(t.engine.pulls).toEqual([]);
  });

  it('not enough space: APP_DISK_FULL with what it needs', async () => {
    const t = await installDaemon(closers, { freeSpace: 100 * 1024 * 1024 });
    const f = await failed(t, 'uptime-kuma');
    expect(f.detail).toMatchObject({ code: 'APP_DISK_FULL', step: 'check', neededBytes: 1024 * 1024 * 1024 });
  });

  it('no internet while downloading: APP_NETWORK_UNREACHABLE at the pull', async () => {
    const t = await installDaemon(closers);
    const image = t.s.catalog.get('uptime-kuma')!.compose.services['uptime-kuma']!.image!;
    t.engine.pullErrors.set(
      image,
      new Error('Get "https://registry-1.docker.io/v2/": dial tcp: lookup registry-1.docker.io: no such host'),
    );
    expect((await failed(t)).detail).toMatchObject({ code: 'APP_NETWORK_UNREACHABLE', step: 'pull' });
  });

  it('a taken port: APP_PORT_IN_USE with the port, at starting containers', async () => {
    const t = await installDaemon(closers);
    t.compose.fail(
      'up',
      'hlabs-uptime-kuma',
      new ComposeError('up failed', 'Bind for 127.0.0.1:12000 failed: port is already allocated', 12000),
    );
    expect((await failed(t)).detail).toMatchObject({ code: 'APP_PORT_IN_USE', step: 'start', port: 12000 });
  });

  it('it never becomes healthy: APP_HEALTH_TIMEOUT with the seconds; a critical notification links back', async () => {
    const probes = fakeProbes(() => 503);
    const t = await installDaemon(closers, { probes });
    t.compose.serviceState.set('uptime-kuma', { health: 'starting' });
    const f = await failed(t);
    expect(f.detail).toMatchObject({ code: 'APP_HEALTH_TIMEOUT', step: 'start', seconds: 120 });
    expect(t.s.db.select().from(notifications).all()).toEqual([
      expect.objectContaining({
        severity: 'critical',
        title: "Uptime Kuma couldn't be installed",
        actionJson: [{ kind: 'navigate', to: '/store/install/uptime-kuma' }],
      }),
    ]);
  });

  it('reads engine and registry errors as the codes people see', () => {
    expect(classifyPullError(new Error('no matching manifest for linux/arm64/v8 in the manifest list entries'))).toBe(
      'APP_NO_PLATFORM',
    );
    expect(classifyPullError(new Error('write /var/lib/docker/tmp: no space left on device'))).toBe('APP_DISK_FULL');
    expect(classifyPullError(new Error('net/http: TLS handshake timeout'))).toBe('APP_NETWORK_UNREACHABLE');
    expect(classifyPullError(new Error('something else'))).toBe('INTERNAL');
  });

  it('apps.get says what went wrong and where the install job is', async () => {
    const t = await installDaemon(closers);
    t.compose.fail('up', 'hlabs-uptime-kuma', new ComposeError('up failed', 'x', 12000));
    const f = await failed(t);
    const got = (await t.d.query(
      `apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`,
    )) as Reply;
    expect(got.result!.data).toMatchObject({
      id: 'uptime-kuma',
      name: 'Uptime Kuma',
      state: 'install_failed',
      stateDetail: { code: 'APP_PORT_IN_USE', port: 12000, step: 'start' },
      installJobId: f.job!.id,
    });
  });
});
