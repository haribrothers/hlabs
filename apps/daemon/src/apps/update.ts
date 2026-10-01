// Updating an app to its store's newer version, and rolling back an update that doesn't start (US-STORE-17, 02 §2.5).
// Before anything changes, the project's compose file, .env and manifest copy and the images it runs are kept in
// `.previous/`. The new version is written with the same settings, its images pulled and started; if it doesn't come up
// healthy, the app goes rolling_back, the kept files go back and the previous version starts again. Data restore from
// the backup taken before the update arrives with backups (phase 5, D-036).
import { hlabsError } from '@hlabs/api';
import { apps, auditLog, jobs as jobsTable, notifications, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineService } from '../engine/service';
import type { JobContext, JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { NotificationService } from '../notifications/service';
import type { CatalogService } from '../store/catalog';
import { COMPOSE_FILE, ENV_FILE } from './compose';
import { resolveEnv } from './env';
import { waitHealthy, type HealthProbes } from './health';
import type { InstallService } from './install';
import { loopbackPort } from './ports';
import { MANIFEST_COPY, type AppService } from './service';
import { canTransition, stateDetail } from './state-machine';

/** The previous version's files, kept beside the project while it updates. */
export const SNAPSHOT_DIR = '.previous';
const SNAPSHOT_FILES = [COMPOSE_FILE, ENV_FILE, MANIFEST_COPY];
export const ROLLED_BACK_KIND = 'app.update_rolled_back';
export const RESTORE_FAILED_KIND = 'app.update_restore_failed';

interface UpdatePayload {
  appId: string;
  userId: string;
  fromVersion: string;
  toVersion: string;
}

export interface UpdateDeps {
  db: HlabsDb;
  logger: Logger;
  jobs: JobRunner;
  catalog: CatalogService;
  apps: AppService;
  installer: Pick<InstallService, 'pullAll' | 'writeProject' | 'keptEnv' | 'storedEnv' | 'storedMounts'>;
  engine: Pick<EngineService, 'client'>;
  notifications: Pick<NotificationService, 'create'>;
  probes?: HealthProbes;
}

export class UpdateService {
  constructor(private readonly deps: UpdateDeps) {}

  register(): void {
    this.deps.jobs.register<UpdatePayload>('app_update', { run: (ctx) => this.run(ctx) });
  }

  /** `apps.update`: a running app to the store's newer version, as a job; the one already going if there is one. */
  update(user: { userId: string }, appId: string): { jobId: string } {
    const { db, jobs, catalog } = this.deps;
    const app = db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    const going = jobs.listActive().find((j) => j.kind === 'app_update' && j.target === appId);
    if (going) return { jobId: going.id };
    if (!canTransition(app.state, 'updating')) {
      throw hlabsError('APP_BUSY', `${appId}: ${app.state} → updating`, { appId, state: app.state });
    }
    const entry = catalog.get(appId, app.sourceId ?? undefined);
    if (!entry) throw hlabsError('NOT_FOUND');
    if (entry.manifest.version === app.version) {
      throw hlabsError('VALIDATION_FAILED', `${appId} is already on ${app.version}`, { appId });
    }
    const payload: UpdatePayload = {
      appId,
      userId: user.userId,
      fromVersion: app.version,
      toVersion: entry.manifest.version,
    };
    return { jobId: jobs.start('app_update', { target: appId, payload }) };
  }

  /**
   * The app's latest rolled-back update, while an admin hasn't dismissed it (its notification is unread), for the
   * banner on the app's page: which versions, the job and whether going back worked. An older one never comes back.
   */
  rolledBack(appId: string) {
    const { db } = this.deps;
    const note = db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.target, appId),
          inArray(notifications.kind, [ROLLED_BACK_KIND, RESTORE_FAILED_KIND]),
          isNull(notifications.userId),
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .get();
    if (!note || note.readAt !== null) return null;
    const job = db
      .select()
      .from(jobsTable)
      .where(and(eq(jobsTable.kind, 'app_update'), eq(jobsTable.target, appId)))
      .orderBy(desc(jobsTable.createdAt))
      .get();
    const payload = (job?.payloadJson ?? {}) as Partial<UpdatePayload>;
    return {
      notificationId: note.id,
      restored: note.kind === ROLLED_BACK_KIND,
      fromVersion: payload.fromVersion ?? '',
      toVersion: payload.toVersion ?? '',
      jobId: job?.id ?? null,
      at: note.createdAt,
    };
  }

  private async run(ctx: JobContext<UpdatePayload>): Promise<void> {
    const { db, catalog, installer } = this.deps;
    const { appId, fromVersion, toVersion, userId } = ctx.payload;
    const app = db.select().from(apps).where(eq(apps.id, appId)).get();
    if (!app) throw hlabsError('NOT_FOUND');
    const entry = catalog.get(appId, app.sourceId ?? undefined);
    if (!entry) throw hlabsError('NOT_FOUND');
    const engine = this.deps.engine.client;
    if (!engine) throw hlabsError('ENGINE_UNAVAILABLE');
    const project = this.deps.apps.project(appId);
    const name = entry.manifest.name;

    // 1. The current version, kept: its files and the images it runs.
    ctx.report(5, 'Keeping the current version');
    const snapshot = join(project.dir, SNAPSHOT_DIR);
    rmSync(snapshot, { recursive: true, force: true });
    mkdirSync(snapshot, { recursive: true });
    for (const file of SNAPSHOT_FILES) {
      if (existsSync(join(project.dir, file))) copyFileSync(join(project.dir, file), join(snapshot, file));
    }
    const digests = Object.fromEntries(
      (await engine.projectContainers(project.name)).map((c) => [c.service, c.imageId]),
    );
    writeFileSync(join(snapshot, 'digests.json'), JSON.stringify(digests, null, 2));
    this.deps.apps.transition(appId, 'updating');

    try {
      // 2. The new version with the same settings, its images, then started and checked.
      const env = resolveEnv(entry.manifest, {}, { ...installer.keptEnv(appId), ...installer.storedEnv(appId) });
      installer.writeProject(
        entry.manifest,
        entry.compose,
        app.hostname,
        app.portFallback!,
        env,
        installer.storedMounts(appId),
      );
      const images = [...new Set(Object.values(entry.compose.services).map((s) => s.image!))];
      await installer.pullAll(ctx, images, (within) =>
        ctx.report(10 + Math.round(within * 50), 'Downloading the new version'),
      );
      ctx.report(65, 'Starting the new version');
      await this.deps.apps.composeUp(appId);
      const health = await waitHealthy({
        engine,
        project: project.name,
        manifest: entry.manifest,
        webPort: loopbackPort(app.portFallback!),
        signal: ctx.signal,
        probes: this.deps.probes,
      });
      if (!health.ok) throw hlabsError('APP_HEALTH_TIMEOUT', `${toVersion} didn't come up healthy`);
    } catch (error) {
      return this.rollBack(ctx, name, snapshot, error);
    }

    const now = Date.now();
    db.transaction((tx) => {
      tx.update(apps)
        .set({ version: toVersion, previousVersion: fromVersion, updatedAt: now })
        .where(eq(apps.id, appId))
        .run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: now,
          userId,
          action: 'app.update',
          target: appId,
          detailJson: { fromVersion, toVersion },
          ip: null,
        })
        .run();
    });
    this.deps.apps.transition(appId, 'running');
    this.deps.notifications.create({
      userId: null,
      kind: 'app.updated',
      target: appId,
      severity: 'success',
      title: `${name} was updated to ${toVersion}`,
    });
    ctx.report(100, 'Updated');
  }

  /** The new version didn't start: the kept files go back and the previous version starts again. */
  private async rollBack(
    ctx: JobContext<UpdatePayload>,
    name: string,
    snapshot: string,
    cause: unknown,
  ): Promise<never> {
    const { appId, fromVersion, toVersion, userId } = ctx.payload;
    this.deps.logger.error({ err: cause, appId, fromVersion, toVersion }, 'update failed; rolling back');
    this.deps.apps.transition(appId, 'rolling_back');
    ctx.report(80, 'Going back to the previous version');
    const project = this.deps.apps.project(appId);
    try {
      for (const file of SNAPSHOT_FILES) {
        if (existsSync(join(snapshot, file))) copyFileSync(join(snapshot, file), join(project.dir, file));
      }
      const engine = this.deps.engine.client;
      if (!engine) throw hlabsError('ENGINE_UNAVAILABLE');
      await this.deps.apps.composeUp(appId);
      const health = await waitHealthy({
        engine,
        project: project.name,
        manifest: this.deps.apps.manifest(appId),
        webPort: loopbackPort(this.deps.db.select().from(apps).where(eq(apps.id, appId)).get()!.portFallback!),
        signal: ctx.signal,
        probes: this.deps.probes,
      });
      if (!health.ok) throw hlabsError('APP_HEALTH_TIMEOUT', `${fromVersion} didn't come back healthy`);
    } catch (error) {
      this.deps.logger.error({ err: error, appId }, 'rolling back failed');
      this.deps.apps.transition(appId, 'error', stateDetail('APP_ROLLBACK_FAILED', { fromVersion, toVersion }));
      this.audit(userId, 'app.update.restore_failed', appId, { fromVersion, toVersion });
      this.notifyRolledBack({ appId, name, fromVersion, toVersion, restored: false });
      throw hlabsError('APP_ROLLBACK_FAILED', `${appId}: ${toVersion} and ${fromVersion} didn't start`, {
        appId,
        fromVersion,
        toVersion,
      });
    }
    this.deps.apps.transition(appId, 'running');
    this.audit(userId, 'app.update.rolled_back', appId, { fromVersion, toVersion });
    this.notifyRolledBack({ appId, name, fromVersion, toVersion, restored: true });
    throw hlabsError('APP_UPDATE_ROLLED_BACK', `${appId}: ${toVersion} didn't start; back on ${fromVersion}`, {
      appId,
      fromVersion,
      toVersion,
    });
  }

  /** The admins told an update rolled back (or that going back failed too); the details page's banner reads it. */
  notifyRolledBack(n: { appId: string; name: string; fromVersion: string; toVersion: string; restored: boolean }) {
    const { appId, name, fromVersion, toVersion } = n;
    return this.deps.notifications.create(
      n.restored
        ? {
            userId: null,
            kind: ROLLED_BACK_KIND,
            target: appId,
            severity: 'warning',
            title: `${name}'s update didn't start, so hlabs rolled it back`,
            body: `It's running ${fromVersion} again.`,
            actions: [{ kind: 'navigate', to: `/store/app/${appId}` }],
          }
        : {
            userId: null,
            kind: RESTORE_FAILED_KIND,
            target: appId,
            severity: 'critical',
            title: `${name} couldn't be restored`,
            body: `Its update to ${toVersion} didn't start, and ${fromVersion} didn't start again either. Check its logs.`,
            actions: [{ kind: 'navigate', to: `/apps/${appId}/logs` }],
          },
    );
  }

  private audit(userId: string, action: string, target: string, detail: Record<string, unknown>) {
    this.deps.db
      .insert(auditLog)
      .values({ id: ulid(), at: Date.now(), userId, action, target, detailJson: detail, ip: null })
      .run();
  }
}
