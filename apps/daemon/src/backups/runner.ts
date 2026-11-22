// Backup runs (US-BKP-04…07, 02 §2.9, D-046, D-133). A `backup` job goes to each destination in turn, one
// `backup_runs` row each: the apps' `backup.preHook`s, then (with "Pause apps briefly" on) their `backup.pause`
// services frozen while restic copies `app-data/<id>` (minus `backup.exclude`) and the included Home folders, tagged
// `app:<id>` / `folder:<id>` and `run:<runId>`, then the system part (an online copy of hlabs.db, `<dataDir>/apps`
// and the secrets bundle), tagged `system`. Paused apps are always resumed. A successful run tidies up with the plan's
// retention. Network steps are tried three times, 5 s apart; a failed scheduled run is tried again once after 30
// minutes. One line per step goes to the run's log, never a password or key.
import { hlabsCodeOf, hlabsError, type HlabsCode } from '@hlabs/api';
import {
  apps,
  appEnv,
  backupDestinations,
  backupRuns,
  setSetting,
  storageLocations,
  users,
  userTotp,
  type HlabsDb,
} from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, desc, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppService } from '../apps/service';
import type { ContainerEngine } from '../engine/types';
import type { EventBus } from '../events/bus';
import type { JobContext, JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { NotificationService } from '../notifications/service';
import type { SecretStore } from '../platform/secrets';
import { nextRun, previousRun } from './cron';
import type { Destinations } from './destinations';
import {
  includedItems,
  includeOf,
  installedItem,
  isOverdue,
  nextRunAt,
  planRow,
  scheduleState,
  type BackupItem,
} from './plan';
import type { Repo, Restic } from './restic';

export const RETRY_TRIES = 3;
export const RETRY_GAP_MS = 5_000;
/** A failed scheduled run is tried again once, this much later (D-046). */
export const RETRY_AFTER_MS = 30 * 60_000;
export const TICK_MS = 60_000;
/** The log of a run kept with it (US-BKP-15 reads it). */
export const LOG_DIR = ['logs', 'backups'];

type Dest = typeof backupDestinations.$inferSelect;
type RunRow = typeof backupRuns.$inferSelect;

export interface BackupPayload {
  trigger: 'schedule' | 'manual' | 'pre_update';
  destinationId?: string;
  retry?: boolean;
}

export interface BackupServiceDeps {
  db: HlabsDb;
  bus: EventBus;
  jobs: JobRunner;
  logger: Logger;
  notifications: NotificationService;
  destinations: Destinations;
  restic: Restic;
  secrets: SecretStore;
  engine: () => ContainerEngine | null;
  apps: Pick<AppService, 'project' | 'manifest'>;
  appDataDir: string;
  dataDir: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const CODES = new Set<HlabsCode>([
  'BACKUP_DEST_UNREACHABLE',
  'BACKUP_DEST_AUTH_FAILED',
  'BACKUP_DEST_FULL',
  'BACKUP_REPO_LOCKED',
  'BACKUP_REPO_PASSWORD_WRONG',
  'BACKUP_PREHOOK_FAILED',
  'BACKUP_INTERRUPTED',
]);

const time = (ms: number) => {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
};

/** "today at 03:30", "tomorrow at 03:00", "24 Sep at 03:00", for log and notification lines. */
export function when(at: number, now: number): string {
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(at) === day(now)) return `today at ${hm}`;
  if (day(at) === day(now + 86_400_000)) return `tomorrow at ${hm}`;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${month} at ${hm}`;
}

/** What went wrong, in a sentence, for the notification (US-BKP-07). */
function reason(code: HlabsCode, dest: string): string {
  switch (code) {
    case 'BACKUP_DEST_UNREACHABLE':
      return `${dest} was not reachable.`;
    case 'BACKUP_DEST_AUTH_FAILED':
      return `hlabs couldn't sign in to ${dest}.`;
    case 'BACKUP_DEST_FULL':
      return `${dest} is full.`;
    case 'BACKUP_REPO_LOCKED':
      return `Another program was using the backups on ${dest}.`;
    case 'BACKUP_REPO_PASSWORD_WRONG':
      return `The encryption password doesn't open the backups on ${dest}.`;
    case 'BACKUP_PREHOOK_FAILED':
      return "An app couldn't get its data ready for the backup.";
    case 'BACKUP_INTERRUPTED':
      return 'hlabs stopped during the backup.';
    default:
      return 'Something went wrong.';
  }
}

export class BackupService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: BackupServiceDeps) {
    deps.jobs.register<BackupPayload>('backup', { run: (ctx) => this.run(ctx) });
  }

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  /** The wait between tries (tests make it instant). */
  sleep = (ms: number) => (this.deps.sleep ? this.deps.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms)));

  /** The backup job running now, if any. */
  active() {
    return this.deps.jobs.listActive().find((j) => j.kind === 'backup') ?? null;
  }

  /** "Back up now" (US-BKP-04): every destination, or one; a run already going is returned instead. */
  runNow(destinationId?: string): { jobId: string } {
    const running = this.active();
    if (running) return { jobId: running.id };
    if (!this.deps.destinations.rows().length) throw hlabsError('NOT_FOUND', 'Add a destination first');
    if (destinationId) this.deps.destinations.get(destinationId);
    return {
      jobId: this.deps.jobs.start<BackupPayload>('backup', {
        payload: { trigger: 'manual', ...(destinationId ? { destinationId } : {}) },
      }),
    };
  }

  /**
   * The backup before an app updates (US-STORE-16): that app's data and the system part to each destination, as
   * `pre_update` runs, inside the update's own job. `no_destination` when there's nowhere to put it (the update goes
   * on and says so); a failed run throws its code, so the update doesn't start without it.
   */
  async beforeUpdate(
    appId: string,
    job: Pick<JobContext<unknown>, 'jobId' | 'target' | 'signal'>,
    report: (fraction: number, message?: string) => void,
  ): Promise<'done' | 'no_destination'> {
    const dests = this.deps.destinations.rows();
    if (!dests.length) return 'no_destination';
    const app = installedItem(this.deps.db, this.deps.appDataDir, appId);
    const ctx: JobContext<BackupPayload> = { ...job, payload: { trigger: 'pre_update' }, report: () => {} };
    for (const [i, dest] of dests.entries()) {
      const code = await this.runOne(dest, app ? [app] : [], ctx, (f, m) => report((i + f) / dests.length, m));
      if (code) throw hlabsError(code);
    }
    return 'done';
  }

  /**
   * A scheduled backup will start (or is starting) before `until`: automatic updates wait for that night's backups
   * (US-STORE-16). False when backups are off or have nowhere to go.
   */
  dueBefore(until: number, now = this.now()): boolean {
    const plan = planRow(this.deps.db);
    if (!plan.enabled || !this.deps.destinations.rows().length) return false;
    if (this.active()) return true;
    const state = scheduleState(this.deps.db);
    const slot = previousRun(plan.scheduleCron, now);
    if (slot !== null && state.lastSlot !== null && slot > state.lastSlot) return true;
    const next = nextRun(plan.scheduleCron, now);
    return next !== null && next < until;
  }

  private async run(ctx: JobContext<BackupPayload>) {
    const { destinations } = this.deps;
    const dests = ctx.payload.destinationId ? [destinations.get(ctx.payload.destinationId)] : destinations.rows();
    const items = includedItems(this.deps.db, this.deps.appDataDir);
    let failed: HlabsCode | null = null;
    for (const [i, dest] of dests.entries()) {
      const code = await this.runOne(dest, items, ctx, (fraction, message) =>
        ctx.report(((i + fraction) / dests.length) * 100, message),
      );
      failed ??= code;
    }
    if (failed) throw hlabsError(failed);
  }

  /** Tries a network step three times, 5 s apart, when the destination didn't answer (D-046). */
  private async retrying<T>(fn: () => Promise<T>, log: (line: string) => void): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const code = hlabsCodeOf(err);
        if (code !== 'BACKUP_DEST_UNREACHABLE' || attempt >= RETRY_TRIES) throw err;
        log(`Retrying (${attempt}/${RETRY_TRIES - 1}): ${(err as Error).message || 'no answer'}`);
        await this.sleep(RETRY_GAP_MS);
      }
    }
  }

  private async openRepo(dest: Dest): Promise<Repo> {
    const repo = await this.deps.destinations.repo(dest);
    if ((await this.deps.restic.probe(repo)) !== 'ok') {
      throw hlabsError('BACKUP_DEST_UNREACHABLE', 'The backups aren’t there');
    }
    return repo;
  }

  /** One destination's run; null when it succeeded, else its error code. */
  private async runOne(
    dest: Dest,
    items: BackupItem[],
    ctx: JobContext<BackupPayload>,
    report: (fraction: number, message?: string) => void,
  ): Promise<HlabsCode | null> {
    const { db, restic, bus } = this.deps;
    const runId = ulid();
    const logPath = join(this.deps.dataDir, ...LOG_DIR, `${runId}.log`);
    mkdirSync(dirname(logPath), { recursive: true });
    const log = (line: string) => appendFileSync(logPath, `${time(this.now())} ${line}\n`);
    const appItems = items.filter((i) => i.kind === 'app');
    db.insert(backupRuns)
      .values({
        id: runId,
        destinationId: dest.id,
        startedAt: this.now(),
        status: 'running',
        trigger: ctx.payload.trigger,
        logPath,
        appCount: appItems.length,
        folderCount: items.length - appItems.length,
        retry: !!ctx.payload.retry,
      })
      .run();
    bus.emit('backup.run', { runId, status: 'running', progress: 0 });
    const paused: Array<{ id: string; app: string }> = [];
    const resume = async () => {
      if (!paused.length) return;
      const names = [...new Set(paused.map((p) => p.app))];
      log(`Resuming apps: ${names.join(', ')}`);
      for (const p of paused.splice(0)) {
        await this.deps
          .engine()
          ?.unpauseContainer(p.id)
          .catch((err) => this.deps.logger.warn({ err, container: p.id }, 'could not resume a paused container'));
      }
    };
    const staging = join(this.deps.dataDir, '.backup', runId);
    let bytes = 0;
    let files = 0;
    try {
      log(`Backing up ${items.length} item${items.length === 1 ? '' : 's'} to ${dest.name}`);
      const repo = await this.retrying(() => this.openRepo(dest), log);
      await this.prepareApps(appItems, paused, log, ctx.signal);
      const steps = items.length + 1;
      for (const [i, item] of items.entries()) {
        if (!existsSync(item.path)) {
          log(`Skipping ${item.label}: nothing there yet`);
          continue;
        }
        log(`Copying ${item.label}`);
        report(i / steps, item.label);
        const res = await this.retrying(
          () =>
            restic.backup(
              repo,
              {
                paths: [item.path],
                tags: [`${item.kind}:${item.id}`, `run:${runId}`],
                excludes: item.kind === 'app' ? this.excludes(item.id) : [],
                signal: ctx.signal,
              },
              (p) => report((i + p.fraction) / steps, item.label),
            ),
          log,
        );
        bytes += res.bytesAdded;
        files += res.filesChanged;
      }
      // Apps go on as soon as their data is copied.
      await resume();
      log('Copying hlabs settings, users and app setup');
      report(items.length / steps, 'hlabs settings');
      const system = await this.retrying(async () => {
        await this.stageSystem(staging, repo);
        return restic.backup(repo, {
          paths: [staging, join(this.deps.dataDir, 'apps')].filter(existsSync),
          tags: ['system', `run:${runId}`],
          signal: ctx.signal,
        });
      }, log);
      bytes += system.bytesAdded;
      files += system.filesChanged;
      db.update(backupRuns)
        .set({ status: 'succeeded', finishedAt: this.now(), bytesAdded: bytes, filesChanged: files })
        .where(eq(backupRuns.id, runId))
        .run();
      log(`Backup finished: ${bytes} bytes changed in ${files} files`);
      bus.emit('backup.run', { runId, status: 'succeeded', progress: 100 });
      await this.tidy(dest, repo, log, report);
      if (ctx.payload.trigger === 'manual') {
        this.deps.notifications.create({
          userId: null,
          kind: 'backup.succeeded',
          target: runId,
          severity: 'success',
          title: 'Backup finished',
          body: `Everything is backed up to ${dest.name}.`,
          actions: [{ kind: 'navigate', to: '/settings/backups' }],
        });
      }
      return null;
    } catch (err) {
      const raw = hlabsCodeOf(err);
      const code: HlabsCode = CODES.has(raw) ? raw : ctx.signal.aborted ? 'BACKUP_INTERRUPTED' : raw;
      this.deps.logger.warn({ err, destination: dest.id, runId }, 'backup failed');
      db.update(backupRuns)
        .set({ status: 'failed', finishedAt: this.now(), bytesAdded: bytes, filesChanged: files, error: code })
        .where(eq(backupRuns.id, runId))
        .run();
      if (code === 'BACKUP_DEST_UNREACHABLE') this.deps.destinations.setStatus(dest.id, 'unreachable');
      const next = this.nextAttempt(ctx.payload);
      log(`${(err as Error).message || code}`);
      log(`Backup stopped. Next attempt: ${next ? when(next, this.now()) : 'when you start one'}`);
      this.notifyFailure(dest, runId, code, next);
      bus.emit('backup.run', { runId, status: 'failed' });
      return code;
    } finally {
      await resume();
      rmSync(staging, { recursive: true, force: true });
      try {
        rmdirSync(dirname(staging));
      } catch {
        // Another run's staging is still there, or it's gone already.
      }
    }
  }

  private excludes(appId: string): string[] {
    try {
      return this.deps.apps.manifest(appId).backup?.exclude ?? [];
    } catch {
      return [];
    }
  }

  /** Each included running app's `backup.preHook`, then its `backup.pause` services frozen (US-BKP-05). */
  private async prepareApps(
    appItems: BackupItem[],
    paused: Array<{ id: string; app: string }>,
    log: (line: string) => void,
    signal: AbortSignal,
  ) {
    const engine = this.deps.engine();
    if (!engine || !appItems.length) return;
    const pauseApps = planRow(this.deps.db).pauseApps;
    const states = new Map(
      this.deps.db
        .select({ id: apps.id, state: apps.state })
        .from(apps)
        .where(
          inArray(
            apps.id,
            appItems.map((a) => a.id),
          ),
        )
        .all()
        .map((a) => [a.id, a.state]),
    );
    for (const item of appItems) {
      // An app in error is still backed up, without its hook or a pause.
      if (states.get(item.id) !== 'running') continue;
      let backup;
      try {
        backup = this.deps.apps.manifest(item.id).backup;
      } catch {
        continue;
      }
      if (!backup) continue;
      const containers = await engine.projectContainers(this.deps.apps.project(item.id).name).catch(() => []);
      if (backup.preHook) {
        const container = containers.find((c) => c.service === backup.preHook!.service && c.state === 'running');
        if (container) {
          log(`Preparing ${item.label}`);
          const res = await engine.execInContainer(container.id, backup.preHook.command, signal);
          if (res.exitCode !== 0)
            throw hlabsError('BACKUP_PREHOOK_FAILED', `${item.label} couldn't get its data ready`);
        }
      }
      if (pauseApps && backup.pause.length) {
        const toPause = containers.filter((c) => backup.pause.includes(c.service) && c.state === 'running');
        if (toPause.length) log(`Pausing ${item.label} for a consistent copy`);
        for (const c of toPause) {
          await engine.pauseContainer(c.id);
          paused.push({ id: c.id, app: item.label });
        }
      }
    }
  }

  /** The system part's own files (02 §2.9): an online copy of hlabs.db and the encrypted secrets bundle. */
  private async stageSystem(staging: string, repo: Repo) {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true, mode: 0o700 });
    await this.deps.db.$client.backup(join(staging, 'hlabs.db'));
    const bundle = await this.secretsBundle(repo.env.RESTIC_PASSWORD ?? '');
    writeFileSync(join(staging, 'secrets.bundle'), JSON.stringify(bundle), { mode: 0o600 });
  }

  /** The keychain items a restored system needs, sealed with the destination's password (AES-256-GCM, scrypt). */
  private async secretsBundle(password: string) {
    const { db, secrets } = this.deps;
    const refs = new Set<string>();
    for (const r of db.select({ ref: userTotp.secretRef }).from(userTotp).all()) refs.add(r.ref);
    for (const r of db
      .select({ ref: storageLocations.secretRef })
      .from(storageLocations)
      .where(isNotNull(storageLocations.secretRef))
      .all())
      refs.add(r.ref!);
    for (const r of db.select({ ref: appEnv.secretRef }).from(appEnv).where(isNotNull(appEnv.secretRef)).all())
      refs.add(r.ref!);
    for (const r of db
      .select({ ref: users.sharePasswordRef })
      .from(users)
      .where(isNotNull(users.sharePasswordRef))
      .all())
      refs.add(r.ref!);
    for (const d of db.select().from(backupDestinations).all()) {
      refs.add(d.repoPasswordRef);
      refs.add(`backup:${d.id}:s3-secret`);
    }
    const values: Record<string, string> = {};
    for (const ref of refs) {
      const v = await secrets.get(ref).catch(() => null);
      if (v !== null) values[ref] = v;
    }
    const salt = randomBytes(16);
    const key = scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(values), 'utf8'), cipher.final()]);
    return {
      v: 1,
      kdf: 'scrypt',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  }

  /** `forget --prune` after a successful run (US-BKP-06); a failure only marks the destination. */
  private async tidy(dest: Dest, repo: Repo, log: (line: string) => void, report: (f: number, m?: string) => void) {
    const { destinations, restic } = this.deps;
    report(1, 'Tidying up old restore points');
    log('Tidying up old restore points');
    try {
      await restic.forget(repo, planRow(this.deps.db).retentionJson);
      destinations.setStatus(dest.id, 'ok');
    } catch (err) {
      log(`Couldn't tidy up old restore points: ${(err as Error).message}`);
      destinations.setStatus(dest.id, 'attention');
    }
    await destinations.refresh(dest.id).catch(() => {});
  }

  /** When it's tried next: the 30-minute retry of a scheduled run, else the next scheduled time (D-046). */
  private nextAttempt(payload: BackupPayload): number | null {
    const now = this.now();
    if (payload.trigger === 'schedule' && !payload.retry) {
      const retryAt = now + RETRY_AFTER_MS;
      setSetting(this.deps.db, 'backupSchedule', { ...scheduleState(this.deps.db), retryAt });
      return retryAt;
    }
    return nextRunAt(planRow(this.deps.db), now);
  }

  /** Warning; critical after three failed runs in a row to the same place (D-046). */
  private notifyFailure(dest: Dest, runId: string, code: HlabsCode, next: number | null) {
    const last = this.deps.db
      .select({ status: backupRuns.status })
      .from(backupRuns)
      .where(eq(backupRuns.destinationId, dest.id))
      .orderBy(desc(backupRuns.startedAt))
      .limit(3)
      .all();
    const critical = last.length === 3 && last.every((r) => r.status === 'failed');
    this.deps.notifications.create({
      userId: null,
      kind: 'backup.failed',
      target: runId,
      severity: critical ? 'critical' : 'warning',
      title: `Backup to ${dest.name} failed`,
      body: `${reason(code, dest.name)}${next ? ` Next attempt: ${when(next, this.now())}.` : ''}`,
      actions: [{ kind: 'navigate', to: '/settings/backups' }],
    });
  }

  /**
   * After a crash (US-BKP-05): a run left `running` is failed with "hlabs stopped during the backup", paused apps are
   * resumed and stale restic locks removed.
   */
  async recover() {
    const { db } = this.deps;
    const stuck = db.select().from(backupRuns).where(eq(backupRuns.status, 'running')).all();
    for (const run of stuck) {
      db.update(backupRuns)
        .set({ status: 'failed', finishedAt: this.now(), error: 'BACKUP_INTERRUPTED' })
        .where(eq(backupRuns.id, run.id))
        .run();
      if (run.logPath) {
        try {
          appendFileSync(run.logPath, `${time(this.now())} hlabs stopped during the backup\n`);
        } catch {
          // The log is gone; the run still says why.
        }
      }
    }
    rmSync(join(this.deps.dataDir, '.backup'), { recursive: true, force: true });
    if (!stuck.length) return;
    const engine = this.deps.engine();
    if (engine) {
      for (const app of db.select({ id: apps.id }).from(apps).all()) {
        const containers = await engine.projectContainers(this.deps.apps.project(app.id).name).catch(() => []);
        for (const c of containers.filter((x) => x.state === 'paused'))
          await engine.unpauseContainer(c.id).catch(() => {});
      }
    }
    for (const dest of this.deps.destinations.rows()) {
      await this.deps.destinations
        .repo(dest)
        .then((repo) => this.deps.restic.unlock(repo))
        .catch(() => {});
    }
  }

  /**
   * Every minute (D-133): the latest scheduled time not yet handled starts a run, so one missed while the computer was
   * asleep or off runs once on waking; the 30-minute retry of a failed scheduled run starts when it's due.
   */
  tick(now = this.now()) {
    const { db } = this.deps;
    const plan = planRow(db);
    const state = scheduleState(db);
    const slot = previousRun(plan.scheduleCron, now);
    if (slot === null) return;
    if (state.lastSlot === null || !plan.enabled || !this.deps.destinations.rows().length) {
      // Nothing to catch up on from before backups were set up.
      if (state.lastSlot !== slot) setSetting(db, 'backupSchedule', { ...state, lastSlot: slot });
      return;
    }
    if (this.active()) return;
    if (slot > state.lastSlot) {
      if (this.startScheduled({ trigger: 'schedule' })) {
        setSetting(db, 'backupSchedule', { lastSlot: slot, retryAt: null });
      }
      return;
    }
    if (state.retryAt !== null && now >= state.retryAt) {
      if (this.startScheduled({ trigger: 'schedule', retry: true })) {
        setSetting(db, 'backupSchedule', { ...state, retryAt: null });
      }
    }
  }

  private startScheduled(payload: BackupPayload): boolean {
    try {
      this.deps.jobs.start<BackupPayload>('backup', { payload });
      return true;
    } catch (err) {
      // Another task holds the system (D-020): try again next minute.
      if (hlabsCodeOf(err) !== 'JOB_EXCLUSIVE_RUNNING')
        this.deps.logger.error({ err }, 'scheduled backup did not start');
      return false;
    }
  }

  start(intervalMs = TICK_MS) {
    void this.recover().catch((err) => this.deps.logger.warn({ err }, 'backup recovery failed'));
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ------------------------------------------------------------------ reading

  runView(row: RunRow) {
    const dest = row.destinationId
      ? this.deps.db
          .select({ name: backupDestinations.name })
          .from(backupDestinations)
          .where(eq(backupDestinations.id, row.destinationId))
          .get()
      : undefined;
    return {
      id: row.id,
      destinationId: row.destinationId,
      destinationName: dest?.name ?? null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      status: row.status,
      trigger: row.trigger,
      bytesAdded: row.bytesAdded,
      filesChanged: row.filesChanged,
      error: (row.error as HlabsCode | null) ?? null,
      appCount: row.appCount,
      folderCount: row.folderCount,
      retry: row.retry,
    };
  }

  /** Newest first, 30 at a time; the cursor is `<startedAt>:<id>` of the last one (US-BKP-03). */
  listRuns(input: { cursor?: string; limit?: number }) {
    const limit = input.limit ?? 30;
    const [at, id] = (input.cursor ?? '').split(':');
    const after =
      input.cursor && at && id
        ? or(lt(backupRuns.startedAt, Number(at)), and(eq(backupRuns.startedAt, Number(at)), lt(backupRuns.id, id)))
        : undefined;
    const rows = this.deps.db
      .select()
      .from(backupRuns)
      .where(after)
      .orderBy(desc(backupRuns.startedAt), desc(backupRuns.id))
      .limit(limit + 1)
      .all();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      runs: page.map((r) => this.runView(r)),
      nextCursor: rows.length > limit && last ? `${last.startedAt}:${last.id}` : null,
    };
  }

  getRun(runId: string) {
    const row = this.deps.db.select().from(backupRuns).where(eq(backupRuns.id, runId)).get();
    if (!row) throw hlabsError('NOT_FOUND');
    let log: string | null;
    try {
      log = row.logPath ? readFileSync(row.logPath, 'utf8') : null;
    } catch {
      log = null;
    }
    return { run: this.runView(row), log };
  }

  /** The top of Backups (US-BKP-01…04). */
  overview(now = this.now()) {
    const { db } = this.deps;
    const plan = planRow(db);
    const include = includeOf(db, plan);
    const items = includedItems(db, this.deps.appDataDir, include);
    const installed = db
      .select({ id: apps.id })
      .from(apps)
      .all()
      .map((a) => a.id);
    const lastRow = db
      .select()
      .from(backupRuns)
      .where(inArray(backupRuns.status, ['succeeded', 'failed']))
      .orderBy(desc(backupRuns.startedAt))
      .get();
    const lastSuccess = db
      .select({ at: backupRuns.finishedAt })
      .from(backupRuns)
      .where(eq(backupRuns.status, 'succeeded'))
      .orderBy(desc(backupRuns.finishedAt))
      .get();
    const firstRun = db.select({ at: backupRuns.startedAt }).from(backupRuns).orderBy(backupRuns.startedAt).get();
    const active = this.active();
    const chart = db
      .select()
      .from(backupRuns)
      .where(inArray(backupRuns.status, ['succeeded', 'failed']))
      .orderBy(desc(backupRuns.startedAt))
      .limit(30)
      .all()
      .reverse()
      .map((r) => ({ id: r.id, startedAt: r.startedAt, status: r.status, bytesAdded: r.bytesAdded }));
    return {
      lastRun: lastRow ? this.runView(lastRow) : null,
      lastSuccessAt: lastSuccess?.at ?? null,
      nextRunAt: nextRunAt(plan, now),
      scheduleEnabled: plan.enabled,
      overdue: isOverdue(plan, lastSuccess?.at ?? null, firstRun?.at ?? null, now),
      included: {
        apps: items.filter((i) => i.kind === 'app').length,
        folders: items.filter((i) => i.kind === 'folder').length,
        notBackedUp: include.includeNewApps ? 0 : installed.filter((id) => !include.apps.includes(id)).length,
      },
      destinations: this.deps.destinations.list(),
      plan: { scheduleCron: plan.scheduleCron, retention: plan.retentionJson },
      running: active ? { jobId: active.id, progress: active.progress, message: active.message } : null,
      blockedBy: this.deps.jobs.blocker('backup'),
      chart,
    };
  }
}
