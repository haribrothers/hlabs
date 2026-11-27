// AppService owns installed apps (02 §2.5): their state, compose projects and routes. Every state change goes
// through `transition`, which checks the edge and emits app.stateChanged. The install, update and uninstall jobs
// (US-STORE-11, US-STORE-17, US-APP-12) build on the pieces here.
import { hlabsCodeOf, hlabsError } from '@hlabs/api';
import {
  FORWARD_IMAGE,
  FORWARD_SERVICE,
  HLABS_NETWORK,
  type AppManifest,
  type ComposeFile,
  type RenderedApp,
} from '@hlabs/app-manifest';
import { appPublic, apps, auditLog, getSetting, type AppState, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { EngineService } from '../engine/service';
import type { EventBus } from '../events/bus';
import type { Logger } from '../logger';
import {
  COMPOSE_FILE,
  ComposeError,
  ENV_FILE,
  type ComposeProject,
  type ComposeRunner,
  type DownOptions,
} from './compose';
import { checkHealthOnce, waitHealthy, type HealthProbes, type HealthResult } from './health';
import { catalogManifest } from './list';
import { loopbackPort } from './ports';
import { canTransition, stateDetail } from './state-machine';

/** The copy of the manifest kept with the project, so an app runs from what it was installed with. */
export const MANIFEST_COPY = 'hlabs-app.json';
/**
 * The compose file it was rendered from, kept with the project, so App settings can render it again after its store
 * has moved on to another version (US-APP-16).
 */
export const SOURCE_COPY = 'hlabs-source.yml';

/** States that have a Caddy route and an mDNS name (not while installing, failed or uninstalling). */
const ROUTED: ReadonlySet<AppState> = new Set([
  'starting',
  'running',
  'stopping',
  'stopped',
  'restarting',
  'updating',
  'rolling_back',
  // A reinstall keeps its address: Caddy's 502 shows it on its way (US-APP-24).
  'reinstalling',
  'error',
]);

export interface AppRoute {
  appId: string;
  /** `<appId>` (the label before `.<hostname>.local`). */
  hostname: string;
  /** The app's port (12000–12999); its web service is on the loopback port 1000 above it (D-049, D-086). */
  port: number;
  auth: 'hlabs' | 'none';
  /** Manifest `web.embed` (D-038): the dashboard may show it in a frame (US-APP-01). */
  embed: boolean;
}

export interface AppServiceDeps {
  db: HlabsDb;
  bus: EventBus;
  logger: Logger;
  engine: EngineService;
  compose: ComposeRunner;
  /** `<dataDir>/apps`: one compose project folder per app. */
  projectsDir: string;
  /** Compose project names are `<projectPrefix>-<appId>` (default `hlabs`, D-090). */
  projectPrefix?: string;
  probes?: HealthProbes;
  now?: () => number;
}

type AppRow = typeof apps.$inferSelect;

export class AppService {
  constructor(private readonly deps: AppServiceDeps) {}

  get(appId: string): AppRow | null {
    return this.deps.db.select().from(apps).where(eq(apps.id, appId)).get() ?? null;
  }

  /**
   * "Start automatically" and "Update automatically" (US-APP-06): saved at once, with the old and new value in the
   * audit log. Custom apps never update automatically.
   */
  setBehaviour(
    appId: string,
    setting: 'autostart' | 'autoUpdate',
    enabled: boolean,
    by: { userId: string; ip?: string | null },
  ): void {
    const app = this.get(appId);
    if (!app) throw hlabsError('NOT_FOUND');
    if (setting === 'autoUpdate' && enabled && app.custom) {
      throw hlabsError('VALIDATION_FAILED', 'Custom apps never update automatically', { appId });
    }
    // A public app stays current: its automatic updates can't be turned off while it's public (07 §7.10).
    if (setting === 'autoUpdate' && !enabled && this.isPublic(appId)) {
      throw hlabsError('APP_IS_PUBLIC', 'Automatic updates stay on while the app is public', { appId });
    }
    const from = app[setting];
    if (from === enabled) return;
    const at = Date.now();
    this.deps.db.transaction((tx) => {
      tx.update(apps)
        .set({ [setting]: enabled, updatedAt: at })
        .where(eq(apps.id, appId))
        .run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at,
          userId: by.userId,
          action: setting === 'autostart' ? 'app.setAutostart' : 'app.setAutoUpdate',
          target: appId,
          detailJson: { from, to: enabled },
          ip: by.ip ?? null,
        })
        .run();
    });
  }

  /** Whether the app is public on the internet now, and with which login (US-APP-27). */
  publicAccess(appId: string): 'hlabs' | 'ownLogin' | null {
    return (
      this.deps.db.select({ access: appPublic.access }).from(appPublic).where(eq(appPublic.appId, appId)).get()
        ?.access ?? null
    );
  }

  isPublic(appId: string): boolean {
    return this.publicAccess(appId) !== null;
  }

  /** Moves an app along an edge of the state machine; refuses with APP_BUSY otherwise. */
  transition(appId: string, to: AppState, detail: string | null = null): AppRow {
    const row = this.deps.db.transaction((tx) => {
      const current = tx.select().from(apps).where(eq(apps.id, appId)).get();
      if (!current) throw hlabsError('NOT_FOUND');
      if (!canTransition(current.state, to)) {
        throw hlabsError('APP_BUSY', `${appId}: ${current.state} → ${to}`, { appId, state: current.state });
      }
      return this.write(tx, appId, to, detail);
    });
    this.deps.bus.emit('app.stateChanged', { appId, state: to, detail });
    return row;
  }

  project(appId: string): ComposeProject {
    return { name: `${this.deps.projectPrefix ?? 'hlabs'}-${appId}`, dir: join(this.deps.projectsDir, appId) };
  }

  /**
   * Writes the rendered compose file, the .env (owner-only: it holds generated secrets), the manifest copy and, when
   * given, the compose file it was rendered from.
   */
  writeProject(appId: string, rendered: RenderedApp, manifest: AppManifest, source?: ComposeFile): ComposeProject {
    const project = this.project(appId);
    mkdirSync(project.dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(project.dir, COMPOSE_FILE), rendered.composeYaml);
    writeFileSync(join(project.dir, ENV_FILE), rendered.envFile, { mode: 0o600 });
    writeFileSync(join(project.dir, MANIFEST_COPY), JSON.stringify(manifest, null, 2));
    if (source) writeFileSync(join(project.dir, SOURCE_COPY), stringifyYaml(source));
    return project;
  }

  /**
   * The compose file to render the app from again (US-APP-16): the one it was rendered from, else its own project's
   * (rendering is idempotent); null without a project.
   */
  sourceCompose(appId: string): ComposeFile | null {
    for (const file of [SOURCE_COPY, COMPOSE_FILE]) {
      try {
        return parseYaml(readFileSync(join(this.project(appId).dir, file), 'utf8')) as ComposeFile;
      } catch {
        // Not there: the next one.
      }
    }
    return null;
  }

  /** The manifest the app was installed with. */
  manifest(appId: string): AppManifest {
    return JSON.parse(readFileSync(join(this.project(appId).dir, MANIFEST_COPY), 'utf8')) as AppManifest;
  }

  /** The app's compose services, in file order (`server`, `database`…, US-APP-09); none without a project. */
  services(appId: string): string[] {
    try {
      const compose = parseYaml(readFileSync(join(this.project(appId).dir, COMPOSE_FILE), 'utf8')) as {
        services?: Record<string, unknown>;
      };
      // Not the forwarding sidecars hlabs adds (D-165): they aren't part of the app.
      return Object.keys(compose.services ?? {}).filter(
        (s) => s !== FORWARD_SERVICE && !s.startsWith(`${FORWARD_SERVICE}-`),
      );
    } catch {
      return [];
    }
  }

  routes(): AppRoute[] {
    return this.deps.db
      .select()
      .from(apps)
      .all()
      .filter((a) => ROUTED.has(a.state) && a.portFallback !== null)
      .map((a) => ({
        appId: a.id,
        hostname: a.hostname,
        port: a.portFallback!,
        auth: a.authMode,
        embed: this.embeds(a.id),
      }));
  }

  /**
   * Whether the dashboard may frame the app: its store listing's `web.embed`, the same one its Home tile reads, so an
   * installed app follows a listing that starts to allow it; without a listing, its installed manifest's.
   */
  private embeds(appId: string): boolean {
    const app = this.get(appId);
    if (!app) return false;
    const listed = catalogManifest(this.deps.db, app).web?.embed;
    if (listed !== undefined) return listed;
    try {
      return this.manifest(appId).web?.embed ?? false;
    } catch {
      return false; // no project: a dev stand-in
    }
  }

  /** When the app's web container started (US-APP-04's uptime); null when it isn't running or can't be asked. */
  async startedAt(appId: string): Promise<number | null> {
    const engine = this.deps.engine.client;
    if (!engine) return null;
    try {
      const service = this.manifest(appId).web?.service;
      const containers = await engine.projectContainers(this.project(appId).name);
      return containers.find((c) => c.service === service && c.state === 'running')?.startedAt ?? null;
    } catch {
      return null; // no project (a dev stand-in), or the engine went away
    }
  }

  /** `compose up` for an app, a taken port reported as APP_PORT_IN_USE. */
  async composeUp(appId: string): Promise<void> {
    await this.pullForwarder(appId);
    try {
      await this.deps.compose.up(this.project(appId));
    } catch (error) {
      throw this.appError(error, appId);
    }
  }

  /**
   * The forwarding sidecar's image, when the project uses it and it isn't here (D-165): compose runs with
   * `--pull never`, and the install and update jobs pull only the app's own images.
   */
  private async pullForwarder(appId: string): Promise<void> {
    const engine = this.deps.engine.client;
    if (!engine) return;
    let text: string;
    try {
      text = readFileSync(join(this.project(appId).dir, COMPOSE_FILE), 'utf8');
    } catch {
      return;
    }
    if (!text.includes(FORWARD_IMAGE) || (await engine.hasImage(FORWARD_IMAGE))) return;
    await engine.pullImage(FORWARD_IMAGE, () => undefined);
  }

  async composeDown(appId: string, options?: DownOptions): Promise<void> {
    await this.deps.compose.down(this.project(appId), options);
  }

  /**
   * Start, stop or restart from the dashboard (US-APP-02…04): refused at once with APP_BUSY when the state machine
   * doesn't allow it (or ENGINE_UNAVAILABLE without an engine), otherwise run in the background; the outcome arrives
   * as app.stateChanged, so a slow health check never holds the request.
   */
  command(appId: string, requested: 'start' | 'stop' | 'restart'): void {
    const app = this.get(appId);
    if (!app) throw hlabsError('NOT_FOUND');
    // Restarting an app that isn't responding starts it again: error has no edge to restarting (US-APP-03).
    const action = requested === 'restart' && app.state === 'error' ? 'start' : requested;
    const to = ({ start: 'starting', stop: 'stopping', restart: 'restarting' } as const)[action];
    if (!canTransition(app.state, to)) {
      throw hlabsError('APP_BUSY', `${appId}: ${app.state} → ${to}`, { appId, state: app.state });
    }
    this.requireEngine();
    const run = action === 'start' ? this.start(appId) : action === 'stop' ? this.stop(appId) : this.restart(appId);
    void run.catch((err: unknown) => this.deps.logger.warn({ err, appId, action }, 'app command failed'));
  }

  /** stopped or error → starting → running (or error when it doesn't come up healthy). */
  async start(appId: string, signal?: AbortSignal): Promise<HealthResult> {
    this.transition(appId, 'starting');
    return this.bringUp(appId, 'up', signal);
  }

  /** running → stopping → stopped. */
  async stop(appId: string): Promise<void> {
    this.transition(appId, 'stopping');
    try {
      await this.deps.compose.stop(this.project(appId));
    } catch (error) {
      this.deps.logger.error({ err: error, appId }, 'compose stop failed');
      // The state machine has no stopping → error edge; the containers' real state decides.
      this.settle(appId, (await this.containersUp(appId)) ? 'running' : 'stopped');
      throw this.appError(error, appId);
    }
    this.transition(appId, 'stopped');
  }

  /** running → restarting → running (or error). */
  async restart(appId: string, signal?: AbortSignal): Promise<HealthResult> {
    this.transition(appId, 'restarting');
    return this.bringUp(appId, 'restart', signal);
  }

  /**
   * At start (02 §2.3 step 4): settle states a crash or shutdown left behind, then bring up apps that should run.
   * Apps with autostart (and the global switch on, US-SYS-20) are started; others that aren't running are stopped.
   */
  async reconcile(signal?: AbortSignal): Promise<void> {
    const autostartAll = getSetting(this.deps.db, 'startup').autostartApps;
    // While paused from the menu bar, apps stay stopped until resumed (US-INST-08).
    const paused = getSetting(this.deps.db, 'paused') !== null;
    // In engine-stopped mode only the leftover states are settled; the rest waits for the engine (US-STATE-10).
    const engineUp = this.deps.engine.client !== null;
    if (engineUp) {
      // Every app's web service joins the shared network (06 §Compose rules).
      await this.requireEngine()
        .ensureNetwork(HLABS_NETWORK)
        .catch((err: unknown) => this.deps.logger.error({ err }, 'could not create the hlabs network'));
    }
    const pending: Array<Promise<unknown>> = [];
    for (const app of this.deps.db.select().from(apps).all()) {
      switch (app.state) {
        case 'installing':
          // The job was failed by JobRunner.recover; the install doesn't resume.
          this.transition(app.id, 'install_failed', stateDetail('INTERNAL', { reason: 'restarted' }));
          continue;
        case 'uninstalling':
        case 'updating':
        case 'rolling_back':
          this.settle(app.id, 'error', stateDetail('INTERNAL', { reason: 'restarted' }));
          continue;
        case 'reinstalling':
          // The job was failed by JobRunner.recover; "Try again" reinstalls it (US-APP-25).
          this.settle(app.id, 'error', stateDetail('INTERNAL', { reason: 'restarted', reinstall: true }));
          continue;
        case 'install_failed':
        case 'stopped':
          continue;
        case 'stopping':
          await this.deps.compose.stop(this.project(app.id)).catch(() => undefined);
          this.settle(app.id, 'stopped');
          continue;
      }
      if (!engineUp) continue;
      if (!existsSync(join(this.project(app.id).dir, MANIFEST_COPY))) {
        this.deps.logger.warn({ appId: app.id }, 'app has no compose project; left as it is');
        continue;
      }
      // starting, running, restarting, error: running and healthy stays running; otherwise start it if it should.
      const check = await checkHealthOnce({
        engine: this.requireEngine(),
        project: this.project(app.id).name,
        manifest: this.manifest(app.id),
        webPort: loopbackPort(app.portFallback!),
        probes: this.deps.probes,
      }).catch(() => ({ ready: false }));
      if (check.ready) {
        if (app.state !== 'running') this.settle(app.id, 'running');
      } else if (autostartAll && app.autostart && !paused) {
        this.settle(app.id, 'starting');
        pending.push(this.bringUp(app.id, 'up', signal).catch(() => undefined));
      } else {
        this.settle(app.id, 'stopped');
      }
    }
    await Promise.all(pending);
  }

  /** `compose up` or `restart`, then wait for health: → running, or → error with the reason. */
  private async bringUp(appId: string, op: 'up' | 'restart', signal?: AbortSignal): Promise<HealthResult> {
    const app = this.get(appId)!;
    const project = this.project(appId);
    this.moveToLoopbackRange(app);
    try {
      if (op === 'up') await this.pullForwarder(appId);
      await (op === 'up' ? this.deps.compose.up(project) : this.deps.compose.restart(project));
    } catch (error) {
      const failure = this.appError(error, appId);
      this.transition(appId, 'error', stateDetail(hlabsCodeOf(failure), detailOf(failure)));
      throw failure;
    }
    const result = await waitHealthy({
      engine: this.requireEngine(),
      project: project.name,
      manifest: this.manifest(appId),
      webPort: loopbackPort(app.portFallback!),
      signal,
      probes: this.deps.probes,
    });
    if (result.ok) this.transition(appId, 'running');
    else if (result.reason === 'timeout') {
      this.transition(appId, 'error', stateDetail('APP_HEALTH_TIMEOUT', { seconds: result.seconds }));
    } else {
      this.transition(appId, 'error', stateDetail('APP_HEALTH_TIMEOUT', { service: result.service, exited: true }));
    }
    return result;
  }

  /**
   * A project written before D-086 publishes its web service on the app port itself; it moves to the loopback range
   * on its next start, where Caddy now looks for it.
   */
  private moveToLoopbackRange(app: AppRow) {
    if (app.portFallback === null) return;
    const file = join(this.project(app.id).dir, COMPOSE_FILE);
    if (!existsSync(file)) return;
    const text = readFileSync(file, 'utf8');
    const old = `127.0.0.1:${app.portFallback}:`;
    if (!text.includes(old)) return;
    writeFileSync(file, text.split(old).join(`127.0.0.1:${loopbackPort(app.portFallback)}:`));
    this.deps.logger.info({ appId: app.id }, 'moved the app to the loopback port range');
  }

  /** Settles a state outside the normal edges (reconcile and failed stops only). */
  private settle(appId: string, to: AppState, detail: string | null = null) {
    const from = this.get(appId)?.state;
    if (from === to && detail === null) return;
    this.deps.logger.info({ appId, from, to }, 'app state settled');
    this.deps.db.transaction((tx) => this.write(tx, appId, to, detail));
    this.deps.bus.emit('app.stateChanged', { appId, state: to, detail });
  }

  private write(tx: Pick<HlabsDb, 'update' | 'select'>, appId: string, to: AppState, detail: string | null): AppRow {
    tx.update(apps)
      .set({ state: to, stateDetail: detail, updatedAt: (this.deps.now ?? Date.now)() })
      .where(eq(apps.id, appId))
      .run();
    return tx.select().from(apps).where(eq(apps.id, appId)).get()!;
  }

  private async containersUp(appId: string): Promise<boolean> {
    const containers = await this.deps.engine.client?.projectContainers(this.project(appId).name).catch(() => []);
    return !!containers?.some((c) => c.state === 'running');
  }

  private requireEngine() {
    const engine = this.deps.engine.client;
    if (!engine) throw hlabsError('ENGINE_UNAVAILABLE');
    return engine;
  }

  /**
   * A compose failure as the hlabsCode people see (a taken port, or the engine gone). What compose said goes to the
   * daemon's log only, for whoever looks into it (never shown to people).
   */
  private appError(error: unknown, appId: string) {
    if (error instanceof ComposeError)
      this.deps.logger.warn({ appId, output: error.output.slice(-4_000) }, error.message);
    if (error instanceof ComposeError && error.portInUse !== null) {
      return hlabsError('APP_PORT_IN_USE', error.message, { appId, port: error.portInUse });
    }
    if (error instanceof ComposeError) return hlabsError('INTERNAL', error.message, { appId });
    return error;
  }
}

function detailOf(error: unknown): Record<string, unknown> {
  return (error as { cause?: { detail?: Record<string, unknown> } }).cause?.detail ?? {};
}
