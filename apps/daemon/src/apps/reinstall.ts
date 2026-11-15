// Reinstalling an app (US-APP-24, US-APP-25, D-125): everything but its data and settings is rebuilt. The app goes
// `reinstalling` at once; the job takes its stack down (never its volumes), removes its images that no other app uses,
// writes the compose file again from the installed version with the same .env, settings, folders, address and port
// (when the store still lists that version; otherwise the project's own file stays), pulls every image again, starts
// it and waits until it's healthy. App data, chosen folders, sharing, Home and Dock places, backup includes and the
// behaviour switches are never touched. A reinstall is refused before anything stops when the app's .env (its
// generated secrets live only there) or its manifest is gone.
import { hlabsCodeOf, hlabsError } from '@hlabs/api';
import type { AppManifest, ComposeFile } from '@hlabs/app-manifest';
import { apps, auditLog, getSetting, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { EngineService } from '../engine/service';
import type { JobContext, JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { NetworkService } from '../network/service';
import type { NotificationService } from '../notifications/service';
import type { CatalogService } from '../store/catalog';
import { COMPOSE_FILE, ENV_FILE } from './compose';
import type { AppDiskUsage } from './disk';
import { isSecret, resolveEnv } from './env';
import { waitHealthy, type HealthProbes } from './health';
import type { InstallService, Installer } from './install';
import { loopbackPort } from './ports';
import { MANIFEST_COPY, type AppService } from './service';
import { canTransition, stateDetail } from './state-machine';

export const REINSTALLED_KIND = 'app.reinstalled';
export const REINSTALL_FAILED_KIND = 'app.reinstall_failed';

/** The job's steps, as `job.progress` messages (`{"step":"pulling"}`) the dashboard names. */
export type ReinstallStep = 'stopping' | 'removing' | 'pulling' | 'starting' | 'health';

interface ReinstallPayload {
  appId: string;
  user: Installer;
}

export interface ReinstallDeps {
  db: HlabsDb;
  logger: Logger;
  jobs: JobRunner;
  catalog: CatalogService;
  apps: AppService;
  installer: Pick<
    InstallService,
    'pullAll' | 'writeProject' | 'keptEnv' | 'storedEnv' | 'storedMounts' | 'prepareAppData'
  >;
  engine: Pick<EngineService, 'client'>;
  network: Pick<NetworkService, 'sync'>;
  notifications: Pick<NotificationService, 'create'>;
  disk?: Pick<AppDiskUsage, 'get'>;
  probes?: HealthProbes;
}

/** What it would reinstall from: the manifest of the installed version, and the compose file to render it with. */
interface Source {
  manifest: AppManifest;
  /** The store's compose file for that version; null when the store has moved on (the project's file stays). */
  compose: ComposeFile | null;
}

type Blocked = 'settings_missing' | 'manifest_missing';

export class ReinstallService {
  constructor(private readonly deps: ReinstallDeps) {}

  register(): void {
    this.deps.jobs.register<ReinstallPayload>('app_reinstall', { run: (ctx) => this.run(ctx) });
  }

  /** `apps.get.reinstall` for admins: the version it installs again, about how much it downloads, and what blocks it. */
  async info(appId: string) {
    const app = this.deps.db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) return null;
    const disk = await this.deps.disk?.get(appId).catch(() => null);
    return { version: app.version, downloadBytes: disk?.imageBytes ?? null, blocked: this.check(appId).blocked };
  }

  /**
   * `apps.reinstall` (US-APP-25): refused while it can't (APP_BUSY, ENGINE_UNAVAILABLE, JOB_EXCLUSIVE_RUNNING,
   * APP_REINSTALL_UNAVAILABLE), else the app goes `reinstalling` at once and the job runs; the one already going when
   * there is one.
   */
  reinstall(user: Installer, appId: string): { jobId: string } {
    const { db, jobs } = this.deps;
    const app = db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    const going = jobs.listActive().find((j) => j.kind === 'app_reinstall' && j.target === appId);
    if (going) return { jobId: going.id };
    if (!canTransition(app.state, 'reinstalling')) {
      throw hlabsError('APP_BUSY', `${appId}: ${app.state} → reinstalling`, { appId, state: app.state });
    }
    // Paused from the menu bar: apps stay stopped until resumed (US-INST-08).
    if (getSetting(db, 'paused') !== null) throw hlabsError('APP_BUSY', 'apps are paused', { appId, paused: true });
    if (!this.deps.engine.client) throw hlabsError('ENGINE_UNAVAILABLE');
    const { blocked } = this.check(appId);
    if (blocked) {
      throw hlabsError('APP_REINSTALL_UNAVAILABLE', `${appId}: ${blocked}`, {
        appId,
        missing: blocked === 'settings_missing' ? 'settings' : 'manifest',
      });
    }
    const jobId = jobs.start('app_reinstall', { target: appId, payload: { appId, user } });
    this.deps.apps.transition(appId, 'reinstalling');
    return { jobId };
  }

  /** Whether it can be reinstalled: its manifest (the project's copy, or the store's for that version) and its .env. */
  private check(appId: string): { source: Source | null; blocked: Blocked | null } {
    const app = this.deps.db.select().from(apps).where(eq(apps.id, appId)).get()!;
    const dir = this.deps.apps.project(appId).dir;
    const entry = this.deps.catalog.get(appId, app.sourceId ?? undefined);
    const listed = entry && entry.manifest.version === app.version ? entry : null;
    let manifest: AppManifest | null;
    try {
      manifest = JSON.parse(readFileSync(join(dir, MANIFEST_COPY), 'utf8')) as AppManifest;
    } catch {
      manifest = listed?.manifest ?? null;
    }
    // Without the store's file for this version, the project's own compose file has to be there.
    if (!manifest || (!listed && !existsSync(join(dir, COMPOSE_FILE))))
      return { source: null, blocked: 'manifest_missing' };
    // Generated secrets and secret settings live only in the .env (07 §7.7): without it they'd be made anew.
    if (manifest.env.some(isSecret) && !existsSync(join(dir, ENV_FILE))) {
      return { source: null, blocked: 'settings_missing' };
    }
    return { source: { manifest, compose: listed?.compose ?? null }, blocked: null };
  }

  private async run(ctx: JobContext<ReinstallPayload>): Promise<void> {
    const { db, installer } = this.deps;
    const { appId, user } = ctx.payload;
    const app = db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    let step: ReinstallStep = 'stopping';
    const report = (s: ReinstallStep, progress: number) => {
      step = s;
      ctx.report(progress, JSON.stringify({ step: s }));
    };
    const name = (() => {
      try {
        return this.deps.apps.manifest(appId).name;
      } catch {
        return appId;
      }
    })();

    try {
      const engine = this.deps.engine.client;
      if (!engine) throw hlabsError('ENGINE_UNAVAILABLE');
      const { source } = this.check(appId);
      if (!source) throw hlabsError('APP_REINSTALL_UNAVAILABLE');
      const project = this.deps.apps.project(appId);

      // 1. Its stack down: containers and network, never its volumes or data.
      report('stopping', 5);
      if (existsSync(join(project.dir, COMPOSE_FILE))) await this.deps.apps.composeDown(appId);

      // 2. Its compose file from the installed version with the same settings, and its images removed.
      report('removing', 15);
      if (source.compose) {
        const env = resolveEnv(source.manifest, {}, { ...installer.keptEnv(appId), ...installer.storedEnv(appId) });
        installer.writeProject(
          source.manifest,
          source.compose,
          app.hostname,
          app.portFallback!,
          env,
          installer.storedMounts(appId),
        );
      }
      const images = this.images(project.dir);
      const shared = this.otherAppsImages(appId);
      for (const image of images) if (!shared.has(image)) await engine.removeImage(image);

      // 3. Every image downloaded again.
      report('pulling', 20);
      await installer.pullAll(ctx, images, (within) =>
        ctx.report(20 + Math.round(within * 60), JSON.stringify({ step: 'pulling' })),
      );

      // 4. Started, and healthy.
      report('starting', 82);
      if (source.compose) installer.prepareAppData(appId, source.compose);
      await engine.ensureNetwork('hlabs');
      await this.deps.apps.composeUp(appId);
      report('health', 90);
      const health = await waitHealthy({
        engine,
        project: project.name,
        manifest: source.manifest,
        webPort: loopbackPort(app.portFallback!),
        signal: ctx.signal,
        probes: this.deps.probes,
      });
      if (!health.ok) {
        throw hlabsError(
          'APP_HEALTH_TIMEOUT',
          `${appId} didn't come up healthy`,
          health.reason === 'timeout'
            ? { seconds: health.seconds }
            : { service: health.service, exitCode: health.exitCode },
        );
      }
      this.deps.apps.transition(appId, 'starting');
      await this.deps.network.sync();
      this.deps.apps.transition(appId, 'running');
    } catch (error) {
      const code = hlabsCodeOf(error);
      const detail = (error as { cause?: { detail?: Record<string, unknown> } }).cause?.detail ?? {};
      this.deps.logger.error({ err: error, appId, step }, 'reinstall failed');
      this.deps.apps.transition(appId, 'error', stateDetail(code, { ...detail, step, reinstall: true }));
      this.deps.notifications.create({
        userId: null,
        kind: REINSTALL_FAILED_KIND,
        target: appId,
        severity: 'warning',
        title: `${name} couldn't be reinstalled`,
        body: 'Its data is as it was.',
        actions: [
          { kind: 'mutation', procedure: 'apps.reinstall', input: { appId }, label: 'Try again' },
          { kind: 'navigate', to: `/apps/${appId}/logs` },
        ],
      });
      throw error;
    }
    db.insert(auditLog)
      .values({
        id: ulid(),
        at: Date.now(),
        userId: user.userId,
        action: 'app.reinstall',
        target: appId,
        detailJson: { version: app.version },
        ip: user.ip ?? null,
      })
      .run();
    this.deps.notifications.create({
      userId: null,
      kind: REINSTALLED_KIND,
      target: appId,
      severity: 'success',
      title: `${name} was reinstalled`,
    });
  }

  /** The images a project's compose file runs. */
  private images(projectDir: string): string[] {
    try {
      const compose = parseYaml(readFileSync(join(projectDir, COMPOSE_FILE), 'utf8')) as ComposeFile;
      return [...new Set(Object.values(compose.services ?? {}).flatMap((s) => (s.image ? [s.image] : [])))];
    } catch {
      return [];
    }
  }

  /** Images other installed apps run, which a reinstall leaves in place (pulled again, never removed). */
  private otherAppsImages(appId: string): Set<string> {
    const ids = this.deps.db
      .select({ id: apps.id })
      .from(apps)
      .all()
      .map((a) => a.id);
    return new Set(ids.filter((id) => id !== appId).flatMap((id) => this.images(this.deps.apps.project(id).dir)));
  }
}
