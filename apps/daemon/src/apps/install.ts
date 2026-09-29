// Installing an app (US-STORE-08…14). `begin` checks the request (folders, address, settings, risky access, who may
// install) and creates the app in `installing` with its compose project written, then queues the `app_install` job.
// The job checks the platform and disk, pulls images (0–80%), creates data folders, starts the stack and waits until
// it's healthy, then sets up its address and marks it running. The app stays `installing` until it is healthy, so any
// failure is `install_failed` (D-081). A failure leaves nothing else changed and can be retried or removed.
import { hlabsCodeOf, hlabsError, type HlabsCode, type InstallStep, type InstallStepDetail } from '@hlabs/api';
import { hasRiskyPermissions, renderApp, type AppManifest, type ComposeFile } from '@hlabs/app-manifest';
import { appEnv, appMounts, apps, auditLog, getSetting, jobs, storageLocations, type HlabsDb } from '@hlabs/db';
import { HOSTNAME_PATTERN, ulid } from '@hlabs/shared';
import { and, desc, eq } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineService } from '../engine/service';
import type { EventBus } from '../events/bus';
import type { JobContext, JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { NetworkService } from '../network/service';
import type { NotificationService } from '../notifications/service';
import type { CatalogService } from '../store/catalog';
import type { StoreHost } from '../store/service';
import { ComposeError, ENV_FILE } from './compose';
import { isSecret, parseEnvFile, resolveEnv } from './env';
import { folderPaths, resolveMounts, type MountRequest } from './folders';
import { waitHealthy, type HealthProbes } from './health';
import { takenHostnames } from './hostnames';
import { allocatePort, loopbackPortFree } from './ports';
import type { AppService } from './service';
import { stateDetail } from './state-machine';

export interface InstallRequest {
  appId: string;
  source?: string;
  env: Record<string, string>;
  mounts: MountRequest[];
  hostname?: string;
  acceptRisks: boolean;
}

export interface Installer {
  userId: string;
  role: 'admin' | 'member';
  ip?: string | null;
}

export interface InstallDeps {
  db: HlabsDb;
  bus: EventBus;
  logger: Logger;
  jobs: JobRunner;
  catalog: CatalogService;
  apps: AppService;
  engine: EngineService;
  network: NetworkService;
  notifications: NotificationService;
  host: StoreHost;
  appDataDir: string;
  /** Free bytes where app data lives (D-011). */
  appDataFreeBytes: () => Promise<number | null>;
  isPortFree?: (port: number) => Promise<boolean>;
  probes?: HealthProbes;
  now?: () => number;
}

/** The share of the bar each step fills: pulls take 0–80%, the rest share 80–100% (US-STORE-12). */
const STEP_RANGE: Record<InstallStep, [number, number]> = {
  check: [0, 2],
  pull: [2, 80],
  folders: [80, 85],
  start: [85, 97],
  network: [97, 100],
};

const NETWORK_ERRORS =
  /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|i\/o timeout|TLS handshake|dial tcp|no such host|network is unreachable|Temporary failure in name resolution/i;

/** A pull or engine error as the code people see (US-STORE-13). */
export function classifyPullError(error: unknown): HlabsCode {
  const text = `${(error as Error)?.message ?? ''} ${(error as { json?: { message?: string } })?.json?.message ?? ''}`;
  if (/no matching manifest|platform .* not supported|does not match the specified platform/i.test(text)) {
    return 'APP_NO_PLATFORM';
  }
  if (/no space left on device/i.test(text)) return 'APP_DISK_FULL';
  if (/engine stopped|ECONNREFUSED.*docker\.sock|connect ENOENT/i.test(text)) return 'ENGINE_UNAVAILABLE';
  if (NETWORK_ERRORS.test(text)) return 'APP_NETWORK_UNREACHABLE';
  return 'INTERNAL';
}

/** An install step failed: which step, and the error to show. */
class StepFailure extends Error {
  constructor(
    readonly step: InstallStep,
    readonly error: unknown,
  ) {
    super(`install step ${step} failed`);
  }
}

export class InstallService {
  constructor(private readonly deps: InstallDeps) {}

  register(): void {
    this.deps.jobs.register<{ appId: string }>('app_install', {
      run: (ctx) => this.run(ctx),
    });
    // Removing a failed install (US-STORE-14); uninstalling a working app joins with US-APP-12.
    this.deps.jobs.register<{ appId: string; user: Installer }>('app_uninstall', {
      run: async ({ payload, report }) => {
        report(10);
        await this.removeFailed(payload.user, payload.appId);
      },
    });
  }

  /** `apps.uninstall` for a failed install: its removal as a job. */
  uninstallFailed(user: Installer, appId: string): { jobId: string } {
    const app = this.deps.db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    if (app.state !== 'install_failed') throw hlabsError('NOT_IMPLEMENTED', 'Uninstalling arrives with US-APP-12');
    return { jobId: this.deps.jobs.start('app_uninstall', { target: appId, payload: { appId, user } }) };
  }

  /** An installed app for the progress and failure pages (`apps.get`). */
  async detail(appId: string) {
    const { db } = this.deps;
    const app = db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    let manifestName = app.id;
    try {
      manifestName = this.deps.apps.manifest(appId).name;
    } catch {
      // No project (a dev stand-in): the id will do.
    }
    const job = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.kind, 'app_install'), eq(jobs.target, appId)))
      .orderBy(desc(jobs.createdAt))
      .get();
    return {
      id: app.id,
      name: manifestName,
      state: app.state,
      stateDetail: app.stateDetail ? (JSON.parse(app.stateDetail) as Record<string, unknown>) : null,
      address: `${app.hostname}.${getSetting(db, 'hostname')}.local`,
      webPort: app.portFallback,
      installJobId: job?.id ?? null,
      nextFreePort:
        app.state === 'install_failed' ? await this.freePort((app.portFallback ?? 11999) + 1).catch(() => null) : null,
    };
  }

  takenHostnames(): string[] {
    return takenHostnames(this.deps.db);
  }

  /** Checks the request and queues the install; returns within moments (US-STORE-11). */
  async begin(user: Installer, req: InstallRequest): Promise<{ jobId: string }> {
    const { db } = this.deps;
    const entry = this.deps.catalog.get(req.appId, req.source);
    if (!entry) throw hlabsError('NOT_FOUND');
    const { manifest, compose, sourceId } = entry;
    const risky = hasRiskyPermissions(manifest);

    // Members install only from the built-in source, only apps without risky access, only when allowed (07 §7.4).
    if (user.role !== 'admin') {
      const allowed = getSetting(db, 'people').membersCanInstall && sourceId === 'builtin' && !risky;
      if (!allowed) throw hlabsError('ACCESS_DENIED');
    }
    // A restore, move or system update blocks installs (D-020): refuse before creating anything.
    this.deps.jobs.assertCanStart('app_install');
    const existing = db.select().from(apps).where(eq(apps.id, req.appId)).get();
    if (existing)
      throw hlabsError('APP_BUSY', `${req.appId} is installed`, { appId: req.appId, state: existing.state });
    if (risky && !req.acceptRisks)
      throw hlabsError('VALIDATION_FAILED', 'Accept the risky access first', { acceptRisks: true });

    const hostname = req.hostname ?? manifest.id;
    if (!HOSTNAME_PATTERN.test(hostname)) throw hlabsError('VALIDATION_FAILED', 'Bad address', { hostname });
    if (this.takenHostnames().includes(hostname)) throw hlabsError('HOSTNAME_TAKEN', undefined, { hostname });

    const env = resolveEnv(manifest, req.env, this.keptEnv(req.appId));
    const mounts = resolveMounts(db, manifest, req.mounts);
    const port = await this.freePort();
    const now = (this.deps.now ?? Date.now)();

    db.transaction((tx) => {
      tx.insert(apps)
        .values({
          id: manifest.id,
          sourceId,
          version: manifest.version,
          state: 'installing',
          hostname,
          portFallback: port,
          authMode: manifest.web.auth,
          installedAt: now,
          updatedAt: now,
          installedBy: user.userId,
        })
        .run();
      for (const p of manifest.env) {
        const secret = isSecret(p);
        tx.insert(appEnv)
          .values({
            appId: manifest.id,
            key: p.key,
            value: secret ? null : env[p.key]!,
            // Secrets live only in the app's .env (07 §7.7).
            secretRef: secret ? 'env' : null,
            isSecret: secret,
          })
          .run();
      }
      for (const m of mounts) {
        tx.insert(appMounts)
          .values({
            id: ulid(),
            appId: manifest.id,
            target: m.target,
            storageLocationId: m.storageLocationId,
            subpath: m.subpath,
            mode: m.mode,
          })
          .run();
      }
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: now,
          userId: user.userId,
          action: 'app.install',
          target: manifest.id,
          detailJson: {
            source: sourceId,
            hostname,
            // The risky access someone agreed to (US-STORE-10).
            acceptedRisks: risky ? riskList(manifest) : [],
          },
          ip: user.ip ?? null,
        })
        .run();
    });
    this.writeProject(
      manifest,
      compose,
      hostname,
      port,
      env,
      mounts.map((m) => ({ target: m.target, hostPath: m.hostPath })),
    );
    this.deps.bus.emit('app.stateChanged', { appId: manifest.id, state: 'installing', detail: null });
    return { jobId: this.deps.jobs.start('app_install', { target: manifest.id, payload: { appId: manifest.id } }) };
  }

  /** From `install_failed`: installs again with the same choices, optionally on another web port (US-STORE-14). */
  async retry(user: Installer, appId: string, webPort?: number): Promise<{ jobId: string }> {
    const { db } = this.deps;
    const app = db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    if (app.state !== 'install_failed') throw hlabsError('APP_BUSY', undefined, { appId, state: app.state });
    const entry = this.deps.catalog.get(appId, app.sourceId ?? undefined);
    if (!entry) throw hlabsError('NOT_FOUND');
    let port = app.portFallback!;
    if (webPort !== undefined && webPort !== port) {
      const held = db.select({ id: apps.id, port: apps.portFallback }).from(apps).all();
      const free = await (this.deps.isPortFree ?? loopbackPortFree)(webPort);
      if (webPort < 12000 || webPort > 12999 || held.some((h) => h.port === webPort && h.id !== appId) || !free) {
        throw hlabsError('APP_PORT_IN_USE', undefined, { port: webPort });
      }
      port = webPort;
      db.update(apps).set({ portFallback: port }).where(eq(apps.id, appId)).run();
    }
    const env = { ...this.keptEnv(appId), ...this.storedEnv(appId) };
    const mounts = this.storedMounts(appId);
    this.writeProject(entry.manifest, entry.compose, app.hostname, port, resolveEnv(entry.manifest, {}, env), mounts);
    this.deps.apps.transition(appId, 'installing');
    db.insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: user.userId,
        action: 'app.install.retry',
        target: appId,
        detailJson: { port },
        ip: user.ip ?? null,
      })
      .run();
    return { jobId: this.deps.jobs.start('app_install', { target: appId, payload: { appId } }) };
  }

  /** The next free web port (the one a "Use a different port" dialog proposes, US-STORE-14). */
  async freePort(from?: number): Promise<number> {
    const held = this.deps.db
      .select({ port: apps.portFallback })
      .from(apps)
      .all()
      .flatMap((a) => (a.port === null ? [] : [a.port]));
    return allocatePort(held, this.deps.isPortFree ?? loopbackPortFree, from);
  }

  /** The job (US-STORE-11): each step reports progress; a failure marks the app install_failed and says why. */
  private async run(ctx: JobContext<{ appId: string }>): Promise<void> {
    const { db } = this.deps;
    const appId = ctx.payload.appId;
    const app = db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    const manifest = this.deps.apps.manifest(appId);
    const compose = this.deps.catalog.get(appId, app.sourceId ?? undefined)?.compose;
    if (!compose) throw hlabsError('NOT_FOUND');
    const images = [...new Set(Object.values(compose.services).map((s) => s.image!))];
    const address = `${app.hostname}.${getSetting(db, 'hostname')}.local`;

    let current: InstallStep = 'check';
    const report = (
      step: InstallStep,
      within: number,
      stepDetail?: InstallStepDetail,
      etaSeconds: number | null = null,
    ) => {
      current = step;
      const [from, to] = STEP_RANGE[step];
      const progress = Math.round(from + (to - from) * Math.max(0, Math.min(1, within)));
      ctx.report(progress, JSON.stringify({ step, detail: stepDetail ?? {} }));
      this.deps.bus.emit('app.installProgress', {
        appId,
        jobId: ctx.jobId,
        progress: Math.max(progress, 0),
        step,
        stepDetail,
        etaSeconds,
      });
    };

    try {
      // 1. Compatibility: an image for this computer, and room for the app.
      report('check', 0);
      const arch = this.deps.host.arm64 ? 'arm64' : 'amd64';
      if (!manifest.platforms.includes(`linux/${arch}`)) {
        throw new StepFailure('check', hlabsError('APP_NO_PLATFORM', undefined, { arch }));
      }
      const need = (manifest.requirements.disk ?? 0) * 1024 * 1024;
      const free = await this.deps.appDataFreeBytes().catch(() => null);
      if (need > 0 && free !== null && free < need) {
        throw new StepFailure('check', hlabsError('APP_DISK_FULL', undefined, { neededBytes: need, freeBytes: free }));
      }
      const engine = this.deps.engine.client;
      if (!engine) throw new StepFailure('check', hlabsError('ENGINE_UNAVAILABLE'));
      report('check', 1, { arch });

      // 2. Images, weighted by bytes; images already here count as done (a retry reuses them).
      await this.pullAll(ctx, images, (within, detail, eta) => report('pull', within, detail, eta)).catch((error) => {
        throw new StepFailure('pull', error instanceof StepFailure ? error.error : error);
      });

      // 3. Data folders: app data, and chosen folders that don't exist yet (a new Home › Photos).
      report('folders', 0);
      try {
        mkdirSync(join(this.deps.appDataDir, appId), { recursive: true });
        for (const path of Object.values(
          folderPaths(manifest, this.storedMounts(appId), join(this.deps.appDataDir, appId)),
        )) {
          mkdirSync(path, { recursive: true });
        }
      } catch (error) {
        throw new StepFailure('folders', hlabsError('STORAGE_NOT_WRITABLE', (error as Error).message));
      }
      report('folders', 1);

      // 4. Start and wait until healthy (still `installing`, D-081).
      report('start', 0);
      await engine.ensureNetwork('hlabs');
      try {
        await this.deps.apps.composeUp(appId);
      } catch (error) {
        throw new StepFailure('start', error);
      }
      report('start', 0.3);
      const health = await waitHealthy({
        engine,
        project: this.deps.apps.project(appId).name,
        manifest,
        webPort: app.portFallback!,
        signal: ctx.signal,
        probes: this.deps.probes,
      });
      if (!health.ok) {
        const seconds = health.reason === 'timeout' ? health.seconds : undefined;
        throw new StepFailure('start', hlabsError('APP_HEALTH_TIMEOUT', undefined, { seconds, app: manifest.name }));
      }
      report('start', 1);

      // 5. Its address: the route and name appear once it's starting, then it's running.
      report('network', 0, { address });
      this.deps.apps.transition(appId, 'starting');
      await this.deps.network.sync();
      this.deps.apps.transition(appId, 'running');
      report('network', 1, { address });
    } catch (error) {
      const failure = error instanceof StepFailure ? error : new StepFailure(current, error);
      const code = hlabsCodeOf(failure.error);
      const detail = (failure.error as { cause?: { detail?: Record<string, unknown> } }).cause?.detail ?? {};
      this.deps.logger.error({ err: failure.error, appId, step: failure.step }, 'install failed');
      this.deps.apps.transition(appId, 'install_failed', stateDetail(code, { ...detail, step: failure.step }));
      this.deps.notifications.create({
        userId: app.installedBy,
        kind: 'app.install_failed',
        target: appId,
        severity: 'critical',
        title: `${manifest.name} couldn't be installed`,
        actions: [{ kind: 'navigate', to: `/store/install/${appId}` }],
      });
      throw hlabsError(code, `install of ${appId} failed at ${failure.step}`, { ...detail, step: failure.step });
    }
    this.deps.notifications.create({
      userId: app.installedBy,
      kind: 'app.installed',
      target: appId,
      severity: 'success',
      title: `${manifest.name} is ready`,
    });
  }

  /** Pulls what's missing; reports bytes across images, never going backwards, with an ETA after 5 s. */
  private async pullAll(
    ctx: JobContext<unknown>,
    images: string[],
    report: (within: number, detail: InstallStepDetail, etaSeconds: number | null) => void,
  ): Promise<void> {
    const engine = this.deps.engine.client;
    if (!engine) throw hlabsError('ENGINE_UNAVAILABLE');
    const present = new Set<string>();
    for (const image of images) if (await engine.hasImage(image)) present.add(image);
    const finished = new Set(present);
    const progress = new Map<string, { current: number; total: number }>();
    let best = 0;
    let downloadStarted: number | null = null;
    const emit = () => {
      // Bytes where known; an image not started yet counts as an average-sized one.
      const known = [...progress.values()].map((p) => p.total);
      const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
      let current = 0;
      let total = 0;
      for (const image of images) {
        const p = progress.get(image);
        const size = p?.total ?? avg;
        total += size;
        current += finished.has(image) ? size : (p?.current ?? 0);
      }
      best = Math.max(best, total > 0 ? current / total : 1);
      let eta: number | null = null;
      if (downloadStarted !== null && best < 1) {
        const elapsed = (Date.now() - downloadStarted) / 1000;
        if (elapsed >= 5 && best > 0) eta = Math.ceil((elapsed * (1 - best)) / best);
      }
      report(best, { done: finished.size, of: images.length }, eta);
    };
    emit();
    for (const image of images) {
      if (finished.has(image)) continue;
      try {
        await engine.pullImage(
          image,
          (p) => {
            downloadStarted ??= Date.now();
            progress.set(image, { current: p.current, total: Math.max(p.total, 1) });
            emit();
          },
          ctx.signal,
        );
      } catch (error) {
        throw hlabsError(classifyPullError(error), (error as Error).message);
      }
      finished.add(image);
      emit();
    }
  }

  private writeProject(
    manifest: AppManifest,
    compose: ComposeFile,
    hostname: string,
    port: number,
    env: Record<string, string>,
    mounts: Array<{ target: string; hostPath: string }>,
  ) {
    const appData = join(this.deps.appDataDir, manifest.id);
    const domain = `${getSetting(this.deps.db, 'hostname')}.local`;
    const rendered = renderApp({
      manifest,
      compose,
      webPort: port,
      appDataDir: appData,
      folders: folderPaths(manifest, mounts, appData),
      hostname: `${hostname}.${domain}`,
      url: `https://${hostname}.${domain}`,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      puid: process.getuid?.() ?? 1000,
      pgid: process.getgid?.() ?? 1000,
      env,
    });
    this.deps.apps.writeProject(manifest.id, rendered, manifest);
  }

  /** Values kept from an earlier install of this app (its .env stays with kept data, US-APP-12). */
  private keptEnv(appId: string): Record<string, string> {
    const file = join(this.deps.apps.project(appId).dir, ENV_FILE);
    return existsSync(file) ? parseEnvFile(readFileSync(file, 'utf8')) : {};
  }

  private storedEnv(appId: string): Record<string, string> {
    const rows = this.deps.db.select().from(appEnv).where(eq(appEnv.appId, appId)).all();
    return Object.fromEntries(rows.flatMap((r) => (r.value === null ? [] : [[r.key, r.value]])));
  }

  private storedMounts(appId: string): Array<{ target: string; hostPath: string }> {
    return this.deps.db
      .select({ target: appMounts.target, subpath: appMounts.subpath, path: storageLocations.path })
      .from(appMounts)
      .innerJoin(storageLocations, eq(storageLocations.id, appMounts.storageLocationId))
      .where(eq(appMounts.appId, appId))
      .all()
      .map((m) => ({ target: m.target, hostPath: join(m.path, m.subpath) }));
  }

  /**
   * "Remove partial install" (US-STORE-14): from `install_failed`, takes down whatever started, deletes the project
   * and `app-data/<appId>` and forgets the app. Folders people chose (Home › Photos) are never touched.
   */
  async removeFailed(user: Installer, appId: string): Promise<void> {
    const { db } = this.deps;
    const app = db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    if (app.state !== 'install_failed') throw hlabsError('APP_BUSY', undefined, { appId, state: app.state });
    const project = this.deps.apps.project(appId);
    if (this.deps.engine.client && existsSync(join(project.dir, 'docker-compose.yml'))) {
      await this.deps.apps.composeDown(appId).catch((err: unknown) => {
        if (!(err instanceof ComposeError)) throw err;
        this.deps.logger.warn({ err, appId }, 'compose down failed while removing a partial install');
      });
    }
    rmSync(project.dir, { recursive: true, force: true });
    rmSync(join(this.deps.appDataDir, appId), { recursive: true, force: true });
    db.transaction((tx) => {
      tx.delete(apps).where(eq(apps.id, appId)).run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: Date.now(),
          userId: user.userId,
          action: 'app.install.remove',
          target: appId,
          detailJson: null,
          ip: user.ip ?? null,
        })
        .run();
    });
    this.deps.bus.emit('app.stateChanged', { appId, state: 'uninstalling', detail: 'removed' });
  }
}

/** The risky access an app asks for, as recorded when someone agrees to it. */
export function riskList(m: AppManifest): string[] {
  return [
    ...(m.permissions.dockerSocket ? ['dockerSocket'] : []),
    ...(m.permissions.gpu ? ['gpu'] : []),
    ...m.ports.map((p) => `port:${p.host}/${p.protocol}`),
  ];
}
