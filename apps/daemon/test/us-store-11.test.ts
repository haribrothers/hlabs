// US-STORE-11 · Run an install as a job: apps.install, the app_install job and what it leaves behind.
import { appEnv, apps, auditLog, jobs, notifications } from '@hlabs/db';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { NoopProxyManager } from '../src/caddy/index';
import { hostTimeZone } from '../src/platform/timezone';
import { installDaemon } from './install-harness';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = {
  result?: { data: Record<string, unknown> };
  error?: { data: { hlabsCode: string; detail?: Record<string, unknown> } };
};

describe('US-STORE-11', () => {
  it('accepts at once: the app is installing and an app_install job is queued', async () => {
    const t = await installDaemon(closers);
    const first: string[] = [];
    t.s.bus.on(({ event }) => {
      if (event.type === 'app.stateChanged') first.push(event.data.state);
    });
    let open!: () => void;
    t.engine.pullGate = new Promise((r) => (open = r));
    const started = Date.now();
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    expect(Date.now() - started).toBeLessThan(500);
    const jobId = res.result!.data.jobId as string;
    expect(t.s.db.select().from(apps).get()).toMatchObject({
      id: 'uptime-kuma',
      state: 'installing',
      hostname: 'uptime-kuma',
    });
    expect(
      t.s.db
        .select()
        .from(jobs)
        .all()
        .find((j) => j.id === jobId),
    ).toMatchObject({ kind: 'app_install', target: 'uptime-kuma' });
    expect(first[0]).toBe('installing');
    open();
    await t.s.jobs.settled(jobId);
  });

  it('runs the steps in order and ends running, reachable, on Home, with a "ready" notification', async () => {
    const t = await installDaemon(closers);
    const states: string[] = [];
    const steps: Array<[string, number]> = [];
    t.s.bus.on(({ event }) => {
      if (event.type === 'app.stateChanged') states.push(event.data.state);
      if (event.type === 'app.installProgress') steps.push([event.data.step!, event.data.progress]);
    });
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    const job = await t.s.jobs.settled(res.result!.data.jobId as string);
    expect(job).toMatchObject({ state: 'succeeded', progress: 100 });
    expect(states).toEqual(['installing', 'starting', 'running']);
    // Steps in order, progress never going backwards.
    const order = [...new Set(steps.map(([s]) => s))];
    expect(order).toEqual(['check', 'pull', 'folders', 'start', 'network']);
    const pcts = steps.map(([, p]) => p);
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b));
    // Pulled, data folder made, stack up, route and name set up.
    expect(t.engine.pulls).toHaveLength(1);
    expect(existsSync(join(t.s.config.paths.appDataDir, 'uptime-kuma'))).toBe(true);
    expect(t.compose.calls).toEqual([{ op: 'up', project: 'hlabs-uptime-kuma' }]);
    expect((t.s.proxy as NoopProxyManager).last?.apps.map((a) => a.appId)).toEqual(['uptime-kuma']);
    // On the installer's Home, with a success notification.
    const home = (await t.d.query('home.getLayout')) as Reply;
    expect((home.result!.data.items as Array<{ id: string }>).some((i) => i.id === 'uptime-kuma')).toBe(true);
    expect(t.s.db.select().from(notifications).all()).toEqual([
      expect.objectContaining({ kind: 'app.installed', severity: 'success', title: 'Uptime Kuma is ready' }),
    ]);
    expect(
      t.s.db
        .select()
        .from(auditLog)
        .all()
        .some((a) => a.action === 'app.install' && a.target === 'uptime-kuma'),
    ).toBe(true);
  });

  it('a second install waits in queued while another app job runs', async () => {
    const t = await installDaemon(closers);
    let open!: () => void;
    t.engine.pullGate = new Promise((r) => (open = r));
    const first = ((await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply).result!.data.jobId as string;
    const second = ((await t.d.mutate('apps.install', { appId: 'vaultwarden' })) as Reply).result!.data.jobId as string;
    await new Promise((r) => setTimeout(r, 50));
    expect(t.s.jobs.get(first)?.state).toBe('running');
    expect(t.s.jobs.get(second)?.state).toBe('queued');
    open();
    t.engine.pullGate = null;
    await t.s.jobs.settled(second);
    expect(t.s.jobs.get(second)?.state).toBe('succeeded');
  });

  it('is refused with JOB_EXCLUSIVE_RUNNING while a restore runs, and nothing is created', async () => {
    const t = await installDaemon(closers);
    t.s.db.insert(jobs).values({ id: 'r1', kind: 'restore', state: 'running', progress: 0, createdAt: 1 }).run();
    const res = (await t.d.mutate('apps.install', { appId: 'uptime-kuma' })) as Reply;
    expect(res.error?.data.hlabsCode).toBe('JOB_EXCLUSIVE_RUNNING');
    expect(t.s.db.select().from(apps).all()).toEqual([]);
  });

  it('keeps generated secrets out of the database, in the owner-only .env', async () => {
    const t = await installDaemon(closers);
    const res = (await t.d.mutate('apps.install', { appId: 'immich', mounts: [] })) as Reply;
    // Immich needs its library folder; with the default location it installs.
    expect(res.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    const ok = (await t.d.mutate('apps.install', {
      appId: 'immich',
      mounts: [{ target: 'library', storageLocationId: 'root', subpath: 'users/hari/Photos', mode: 'rw' }],
    })) as Reply;
    await t.s.jobs.settled(ok.result!.data.jobId as string);
    const row = t.s.db
      .select()
      .from(appEnv)
      .all()
      .find((e) => e.key === 'DB_PASSWORD')!;
    expect(row).toMatchObject({ value: null, isSecret: true, secretRef: 'env' });
    const envFile = join(t.s.config.paths.dataDir, 'apps', 'immich', '.env');
    expect(readFileSync(envFile, 'utf8')).toMatch(/^DB_PASSWORD='[A-Za-z0-9_-]{43}'$/m);
    expect(statSync(envFile).mode & 0o777).toBe(0o600);
    // The chosen folder was created in Home.
    expect(existsSync(join(t.root, 'users', 'hari', 'Photos'))).toBe(true);
  });

  it('a restart mid-install ends in install_failed, "hlabs restarted", and the page can say so', async () => {
    const t = await installDaemon(closers);
    // What the next boot finds: an app left installing (JobRunner.recover has already failed its job).
    const now = Date.now();
    t.s.db
      .insert(apps)
      .values({
        id: 'uptime-kuma',
        sourceId: 'builtin',
        version: '2.0.0',
        state: 'installing',
        hostname: 'uptime-kuma',
        installedAt: now,
        updatedAt: now,
      })
      .run();
    await t.s.apps.reconcile();
    const app = (await t.d.query(
      `apps.get?input=${encodeURIComponent(JSON.stringify({ appId: 'uptime-kuma' }))}`,
    )) as Reply;
    expect(app.error).toBeUndefined();
    expect(app.result!.data).toMatchObject({
      state: 'install_failed',
      stateDetail: { code: 'INTERNAL', reason: 'restarted' },
    });
  });

  it("passes apps this computer's time zone by its current name", () => {
    const none = () => null;
    expect(hostTimeZone({ env: '', readLink: () => '/var/db/timezone/zoneinfo/Asia/Kolkata' })).toBe('Asia/Kolkata');
    expect(hostTimeZone({ env: '', readLink: () => '/usr/share/zoneinfo/Europe/Berlin' })).toBe('Europe/Berlin');
    // ICU's legacy ids become the current ones.
    expect(hostTimeZone({ env: '', readLink: none, intl: () => 'Asia/Calcutta' })).toBe('Asia/Kolkata');
    expect(hostTimeZone({ env: 'Europe/Kiev', readLink: none })).toBe('Europe/Kyiv');
    expect(hostTimeZone({ env: '', readLink: none, intl: () => undefined })).toBe('UTC');
  });
});
