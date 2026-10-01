// AppService (02 §2.5): the state machine, compose projects, health waits and the start-up reconcile.
import { hlabsCodeOf } from '@hlabs/api';
import { renderApp, type AppManifest } from '@hlabs/app-manifest';
import { loadAppDir } from '@hlabs/app-manifest/node';
import { apps, openDb, setSetting, type AppState } from '@hlabs/db';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkHealthOnce, type HealthProbes } from '../src/apps/health';
import type { ContainerState } from '../src/engine/types';
import { AppService } from '../src/apps/service';
import { APP_TRANSITIONS } from '../src/apps/state-machine';
import { EngineService } from '../src/engine/service';
import { EventBus } from '../src/events/bus';
import { silentLogger } from '../src/logger';
import { FakeCompose } from './fakes/compose';
import { FakeEngine, fakeMachine } from './fakes/engine';
import { tempDir } from './helpers';

const STORE = fileURLToPath(new URL('../../../store', import.meta.url));

/** HTTP answers by URL (default: 200), a fake clock that sleeps instantly. */
function fakeProbes(http: (url: string) => number | null = () => 200) {
  let clock = 0;
  const probes: HealthProbes = {
    http: async (url) => http(url),
    tcp: async () => true,
    sleep: async (ms) => void (clock += ms),
    now: () => clock,
  };
  return probes;
}

async function setup(options: { probes?: HealthProbes; engineRunning?: boolean } = {}) {
  const dir = tempDir();
  const db = openDb({ dataDir: dir });
  const bus = new EventBus();
  const states: Array<[string, AppState, string | null]> = [];
  bus.on(({ event }) => {
    if (event.type === 'app.stateChanged') states.push([event.data.appId, event.data.state, event.data.detail]);
  });
  const fake = new FakeEngine(options.engineRunning ?? true);
  const engine = new EngineService({
    bus,
    logger: silentLogger(),
    candidates: async () => [{ kind: 'orbstack', socketPath: '/s', managedByHlabs: false }],
    detect: fakeMachine({ '/s': fake }),
  });
  await engine.check();
  const compose = new FakeCompose(fake);
  const service = new AppService({
    db,
    bus,
    logger: silentLogger(),
    engine,
    compose,
    projectsDir: join(dir, 'apps'),
    probes: options.probes ?? fakeProbes(),
    now: () => 42,
  });

  /** An installed app: its row, project files and pulled images. */
  function install(
    appId: string,
    state: AppState,
    patch: Partial<typeof apps.$inferInsert> = {},
    options: { beforeD086?: boolean } = {},
  ) {
    const loaded = loadAppDir(join(STORE, 'apps', appId), { requireDigest: true });
    const manifest = loaded.manifest as AppManifest;
    const port = 12000 + db.select().from(apps).all().length;
    const rendered = renderApp({
      manifest,
      compose: loaded.compose!,
      // Published on the loopback range (D-086), or on the app port as projects written before it were.
      webPort: options.beforeD086 ? port : port + 1000,
      appDataDir: join(dir, 'app-data', appId),
      folders: Object.fromEntries(manifest.folders.map((f) => [f.key, join(dir, 'storage', f.key)])),
      hostname: `${appId}.hlabs.local`,
      url: `https://${appId}.hlabs.local`,
      tz: 'UTC',
      puid: 501,
      pgid: 20,
      env: Object.fromEntries(manifest.env.map((e) => [e.key, 'x'])),
    });
    db.insert(apps)
      .values({
        id: appId,
        sourceId: null,
        version: manifest.version,
        state,
        hostname: appId,
        portFallback: port,
        installedAt: 1,
        updatedAt: 1,
        ...patch,
      })
      .run();
    service.writeProject(appId, rendered, manifest);
    for (const svc of Object.values(loaded.compose!.services)) fake.images.add(svc.image!);
    return { manifest, port, project: service.project(appId) };
  }

  const stateOf = (appId: string) =>
    db
      .select()
      .from(apps)
      .all()
      .find((a) => a.id === appId)?.state;
  return { db, dir, service, fake, compose, states, install, stateOf };
}

describe('state machine', () => {
  it('matches 02 §2.5', () => {
    expect(APP_TRANSITIONS.install_failed).toEqual(['installing']);
    expect(APP_TRANSITIONS.updating).toEqual(['running', 'rolling_back']);
    expect(APP_TRANSITIONS.uninstalling).toEqual(['error']);
    expect(APP_TRANSITIONS.stopped).toEqual(['starting', 'uninstalling']);
  });

  it('moves along an edge and emits app.stateChanged; other moves are APP_BUSY', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'running');
    t.service.transition('uptime-kuma', 'stopping');
    expect(t.states).toEqual([['uptime-kuma', 'stopping', null]]);
    expect(() => t.service.transition('uptime-kuma', 'running')).toThrow();
    try {
      t.service.transition('uptime-kuma', 'running');
    } catch (e) {
      expect(hlabsCodeOf(e)).toBe('APP_BUSY');
    }
    expect(hlabsCodeOf(catchError(() => t.service.transition('nope', 'running')))).toBe('NOT_FOUND');
  });
});

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
}

describe('project files', () => {
  it('writes the compose file, an owner-only .env and the manifest copy', async () => {
    const t = await setup();
    const { project, port } = t.install('uptime-kuma', 'running');
    expect(project).toEqual({ name: 'hlabs-uptime-kuma', dir: join(t.dir, 'apps', 'uptime-kuma') });
    expect(readFileSync(join(project.dir, 'docker-compose.yml'), 'utf8')).toContain(`127.0.0.1:${port + 1000}:3001`);
    expect(statSync(join(project.dir, '.env')).mode & 0o777).toBe(0o600);
    expect(t.service.manifest('uptime-kuma').id).toBe('uptime-kuma');
  });

  it('moves a project written before D-086 to the loopback range on its next start', async () => {
    const t = await setup();
    const { project, port } = t.install('uptime-kuma', 'stopped', {}, { beforeD086: true });
    const file = join(project.dir, 'docker-compose.yml');
    expect(readFileSync(file, 'utf8')).toContain(`127.0.0.1:${port}:3001`);
    await t.service.start('uptime-kuma');
    expect(readFileSync(file, 'utf8')).toContain(`127.0.0.1:${port + 1000}:3001`);
    expect(readFileSync(file, 'utf8')).not.toContain(`127.0.0.1:${port}:`);
  });
});

describe('start, stop and restart', () => {
  it('start: stopped → starting → running once the web port answers', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'stopped');
    expect(await t.service.start('uptime-kuma')).toEqual({ ok: true });
    expect(t.states.map((s) => s[1])).toEqual(['starting', 'running']);
    expect(t.compose.calls).toEqual([{ op: 'up', project: 'hlabs-uptime-kuma' }]);
  });

  it('start: → error with APP_HEALTH_TIMEOUT when it never becomes healthy', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'stopped');
    t.compose.serviceState.set('uptime-kuma', { health: 'starting' });
    expect(await t.service.start('uptime-kuma')).toEqual({ ok: false, reason: 'timeout', seconds: 120 });
    expect(t.states.at(-1)).toEqual([
      'uptime-kuma',
      'error',
      JSON.stringify({ seconds: 120, code: 'APP_HEALTH_TIMEOUT' }),
    ]);
  });

  it('start: → error straight away when a container exits with an error', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'stopped');
    t.compose.serviceState.set('uptime-kuma', { state: 'exited', exitCode: 1, startedAt: null });
    expect(await t.service.start('uptime-kuma')).toMatchObject({ ok: false, reason: 'exited', exitCode: 1 });
    expect(t.stateOf('uptime-kuma')).toBe('error');
  });

  it('start: a taken port → error with APP_PORT_IN_USE and the port', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'stopped');
    const { ComposeError } = await import('../src/apps/compose');
    t.compose.fail('up', 'hlabs-uptime-kuma', new ComposeError('up failed', 'port is already allocated', 12000));
    const error = await t.service.start('uptime-kuma').catch((e) => e);
    expect(hlabsCodeOf(error)).toBe('APP_PORT_IN_USE');
    expect(JSON.parse(t.states.at(-1)![2]!)).toMatchObject({ code: 'APP_PORT_IN_USE', port: 12000 });
  });

  it('stop: running → stopping → stopped; a second stop is APP_BUSY', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'stopped');
    await t.service.start('uptime-kuma');
    await t.service.stop('uptime-kuma');
    expect(t.states.map((s) => s[1])).toEqual(['starting', 'running', 'stopping', 'stopped']);
    await expect(t.service.stop('uptime-kuma')).rejects.toSatisfy((e) => hlabsCodeOf(e) === 'APP_BUSY');
  });

  it('stop: when compose fails, the state follows the containers', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'stopped');
    await t.service.start('uptime-kuma');
    t.compose.fail('stop', 'hlabs-uptime-kuma');
    await expect(t.service.stop('uptime-kuma')).rejects.toBeTruthy();
    expect(t.stateOf('uptime-kuma')).toBe('running');
  });

  it('restart: running → restarting → running', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'stopped');
    await t.service.start('uptime-kuma');
    await t.service.restart('uptime-kuma');
    expect(t.states.map((s) => s[1]).slice(-2)).toEqual(['restarting', 'running']);
  });

  it('uses the manifest http check (Vaultwarden /alive): it must answer 2xx or 3xx', async () => {
    const seen: string[] = [];
    let status = 503;
    const t = await setup({ probes: fakeProbes((url) => (seen.push(url), status)) });
    const { port } = t.install('vaultwarden', 'stopped');
    expect(await t.service.start('vaultwarden')).toEqual({ ok: false, reason: 'timeout', seconds: 60 });
    // The loopback port, 1000 above the app's port (D-086).
    expect(seen[0]).toBe(`http://127.0.0.1:${port + 1000}/alive`);
    status = 200;
    await t.service.start('vaultwarden');
    expect(t.stateOf('vaultwarden')).toBe('running');
  });
});

describe('checkHealthOnce', () => {
  const base = {
    schema: 1,
    id: 'demo',
    web: { service: 'web', port: 80, path: '/', auth: 'hlabs', embed: false },
  } as unknown as AppManifest;
  const container = (service: string, patch: Partial<ContainerState> = {}): ContainerState => ({
    id: service,
    service,
    state: 'running',
    health: null,
    image: 'x',
    imageId: 'sha256:x',
    startedAt: 1,
    exitCode: null,
    ...patch,
  });
  async function check(
    manifest: AppManifest,
    containers: ContainerState[],
    http = (_: string) => 200 as number | null,
  ) {
    const engine = new FakeEngine();
    engine.containers.set('hlabs-demo', containers);
    return checkHealthOnce({ engine, project: 'hlabs-demo', manifest, webPort: 12000, probes: fakeProbes(http) });
  }

  it('by default, the web service answering anything below 500', async () => {
    expect((await check(base, [container('web')], () => 401)).ready).toBe(true);
    expect((await check(base, [container('web')], () => 502)).ready).toBe(false);
    expect((await check(base, [container('web')], () => null)).ready).toBe(false);
  });

  it('a check on an unpublished service falls back to its container and healthcheck', async () => {
    const manifest = { ...base, health: { service: 'db', http: '/ping', timeout: 60 } } as AppManifest;
    const seen: string[] = [];
    const probe = (url: string) => (seen.push(url), 200);
    expect((await check(manifest, [container('web'), container('db', { health: 'starting' })], probe)).ready).toBe(
      false,
    );
    expect((await check(manifest, [container('web'), container('db', { health: 'healthy' })], probe)).ready).toBe(true);
    expect(seen).toEqual([]);
  });

  it('a one-shot service that finished is fine; one that failed ends the wait', async () => {
    expect((await check(base, [container('web'), container('init', { state: 'exited', exitCode: 0 })])).ready).toBe(
      true,
    );
    const failed = await check(base, [container('web'), container('init', { state: 'exited', exitCode: 3 })]);
    expect(failed.failed).toEqual({ ok: false, reason: 'exited', service: 'init', exitCode: 3 });
  });

  it('a container crash-looping under its restart policy ends the wait at once', async () => {
    const looping = await check(base, [container('web', { state: 'restarting', exitCode: 1 })]);
    expect(looping.failed).toEqual({ ok: false, reason: 'exited', service: 'web', exitCode: 1 });
    // Restarting after a clean exit (or before any) isn't a crash.
    expect((await check(base, [container('web', { state: 'restarting', exitCode: 0 })])).failed).toBeUndefined();
  });
});

describe('routes', () => {
  it('lists apps that have a route: not installing, failed or uninstalling', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'running');
    t.install('vaultwarden', 'install_failed');
    t.install('immich', 'stopped', { authMode: 'none' });
    expect(t.service.routes()).toEqual([
      { appId: 'uptime-kuma', hostname: 'uptime-kuma', port: 12000, auth: 'hlabs', embed: true },
      { appId: 'immich', hostname: 'immich', port: 12002, auth: 'none', embed: true },
    ]);
  });
});

describe('reconcile (02 §2.3 step 4)', () => {
  it('settles what a restart left behind', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'installing');
    t.install('vaultwarden', 'updating');
    t.install('immich', 'stopping');
    await t.service.reconcile();
    expect(t.stateOf('uptime-kuma')).toBe('install_failed');
    expect(t.stateOf('vaultwarden')).toBe('error');
    expect(t.stateOf('immich')).toBe('stopped');
    expect(t.fake.networks.has('hlabs')).toBe(true);
  });

  it('keeps a healthy app running and starts one that should run', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'stopped');
    await t.service.start('uptime-kuma');
    t.install('vaultwarden', 'running');
    t.states.length = 0;
    await t.service.reconcile();
    expect(t.stateOf('uptime-kuma')).toBe('running');
    expect(t.states).toEqual([
      ['vaultwarden', 'starting', null],
      ['vaultwarden', 'running', null],
    ]);
  });

  it('leaves an app stopped when autostart is off for it or for all apps', async () => {
    const t = await setup();
    t.install('uptime-kuma', 'running', { autostart: false });
    t.install('vaultwarden', 'error');
    setSetting(t.db, 'startup', { startAtLogin: true, autostartApps: true, keepAwake: true });
    await t.service.reconcile();
    expect(t.stateOf('uptime-kuma')).toBe('stopped');
    expect(t.stateOf('vaultwarden')).toBe('running');

    const u = await setup();
    u.install('uptime-kuma', 'running');
    setSetting(u.db, 'startup', { startAtLogin: true, autostartApps: false, keepAwake: true });
    await u.service.reconcile();
    expect(u.stateOf('uptime-kuma')).toBe('stopped');
    expect(u.compose.calls).toEqual([]);
  });

  it('leaves an app without a compose project alone and reconciles the rest', async () => {
    const t = await setup();
    t.db
      .insert(apps)
      .values({
        id: 'ghost',
        version: '1',
        state: 'running',
        hostname: 'ghost',
        portFallback: 12900,
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    t.install('vaultwarden', 'running');
    await t.service.reconcile();
    expect(t.stateOf('ghost')).toBe('running');
    expect(t.stateOf('vaultwarden')).toBe('running');
    expect(t.compose.calls).toEqual([{ op: 'up', project: 'hlabs-vaultwarden' }]);
  });

  it('without an engine, only settles leftover states', async () => {
    const t = await setup({ engineRunning: false });
    t.install('uptime-kuma', 'running');
    t.install('vaultwarden', 'installing');
    await t.service.reconcile();
    expect(t.stateOf('uptime-kuma')).toBe('running');
    expect(t.stateOf('vaultwarden')).toBe('install_failed');
    expect(t.compose.calls).toEqual([]);
  });
});
