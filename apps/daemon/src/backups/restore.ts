// Restores (US-BKP-17…22, 02 §2.9, D-024). A restore point is one run's snapshots (its `run:<id>` tag). "Replace
// current data" stops the apps, moves their current data aside as the safety copy, has restic restore into a staging
// folder beside each target (`<appDataDir>/.restore/<id>/`, `<storageRoot>/.restore/<id>/`), swaps staging in with a
// rename and starts the apps, waiting for their health checks. Until swap-in it can be cancelled, and anything that
// goes wrong puts the safety copy back and starts the apps again; from swap-in on it finishes. "Restore as a copy"
// puts the items in the person's Home › Restored › <date time> and stops nothing. Everything, replaced, also restores
// the system part and restarts hlabs. A crash mid-restore is settled on the next start.
import { hlabsCodeOf, hlabsError, type HlabsCode } from '@hlabs/api';
import {
  apps,
  auditLog,
  backupDestinations,
  backupRuns,
  restores,
  users,
  type HlabsDb,
  type RestoreStep,
} from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import { createDecipheriv, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rootLocation } from '../apps/folders';
import type { AppService } from '../apps/service';
import type { EventBus } from '../events/bus';
import type { JobContext, JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { NotificationService } from '../notifications/service';
import type { SecretStore } from '../platform/secrets';
import type { Destinations } from './destinations';
import { homeFolders, installedApps, planRow } from './plan';
import type { Repo, Restic, Snapshot } from './restic';

type RestoreRow = typeof restores.$inferSelect;
type Phase = RestoreRow['phase'];

/** Where a restore can still be cancelled (D-024). */
const CANCELLABLE: Phase[] = ['checking', 'stopping', 'safety', 'copying'];
/** The database a whole-system restore leaves for the next start to put in place. */
export const PENDING_DB = 'hlabs.db.restored';

export interface RestoreScope {
  mode: 'replace' | 'copy';
  apps: string[];
  folders: string[];
}

interface StoredScope extends RestoreScope {
  pointTime: number;
  wholeSystem: boolean;
  /** Each item's snapshot and the folder it backed up. */
  snaps: Record<string, { snapshotId: string; path: string; bytes: number }>;
  systemSnap: { snapshotId: string; paths: string[] } | null;
  copyFolder: string | null;
}

export interface RestoreDeps {
  db: HlabsDb;
  bus: EventBus;
  jobs: JobRunner;
  logger: Logger;
  notifications: NotificationService;
  destinations: Destinations;
  restic: Restic;
  secrets: SecretStore;
  apps: Pick<AppService, 'stop' | 'start'>;
  freeBytes: (path: string) => Promise<number>;
  confirmPassword: (userId: string, password: string, action: string, ip: string) => Promise<void>;
  appDataDir: string;
  dataDir: string;
  /** Ends the daemon so launchd or systemd starts it again (D-133): after a whole-system restore. */
  restartDaemon: () => void;
  /** Deletes a copy of an app's data, clearing what the app wrote as root through its own image (Linux). */
  removeAppFolder?: (appId: string, folder: string) => Promise<void>;
  now?: () => number;
}

const itemKey = (kind: 'app' | 'folder', id: string) => `${kind}:${id}`;
const safeName = (s: string) => s.replace(/[/\\:]/g, '-');

export class RestoreService {
  constructor(private readonly deps: RestoreDeps) {
    deps.jobs.register<{ restoreId: string }>('restore', { run: (ctx) => this.run(ctx), cancellable: true });
  }

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  // ------------------------------------------------------------------ restore points

  private async snapshotsOf(destinationId: string): Promise<{ repo: Repo; snaps: Snapshot[]; name: string }> {
    const dest = this.deps.destinations.get(destinationId);
    const repo = await this.deps.destinations.repo(dest);
    return { repo, snaps: await this.deps.restic.snapshots(repo), name: dest.name };
  }

  /** Restore points newest first; the oldest kept for a week or a month is "Weekly"/"Monthly" (US-BKP-17). */
  async points(destinationId: string) {
    const { snaps } = await this.snapshotsOf(destinationId);
    const groups = new Map<string, number>();
    for (const s of snaps) {
      const run = s.tags.find((t) => t.startsWith('run:'))?.slice(4);
      if (run) groups.set(run, Math.max(groups.get(run) ?? 0, s.time));
    }
    const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
    const runs = new Map(
      this.deps.db
        .select({ id: backupRuns.id, bytes: backupRuns.bytesAdded })
        .from(backupRuns)
        .where(inArray(backupRuns.id, sorted.map(([id]) => id).concat([''])))
        .all()
        .map((r) => [r.id, r.bytes]),
    );
    const { daily, weekly } = planRow(this.deps.db).retentionJson;
    const days = new Set<string>();
    return {
      points: sorted.map(([id, time]) => {
        const day = new Date(time).toDateString();
        days.add(day);
        const kind: 'daily' | 'weekly' | 'monthly' =
          days.size <= daily ? 'daily' : days.size <= daily + weekly ? 'weekly' : 'monthly';
        return { id, time, kind, bytesChanged: runs.get(id) ?? null };
      }),
    };
  }

  private async pointSnaps(destinationId: string, pointId: string) {
    const { repo, snaps, name } = await this.snapshotsOf(destinationId);
    const mine = snaps.filter((s) => s.tags.includes(`run:${pointId}`));
    if (!mine.length) throw hlabsError('NOT_FOUND', 'No such restore point');
    return { repo, snaps: mine, name, time: Math.max(...mine.map((s) => s.time)) };
  }

  private labels() {
    const appNames = new Map(installedApps(this.deps.db).map((a) => [a.row.id, a.name]));
    const folderNames = new Map(homeFolders(this.deps.db).map((f) => [f.id, f.label]));
    return {
      app: (id: string) => appNames.get(id) ?? id,
      folder: (id: string) =>
        folderNames.get(id) ?? (id === 'shared' ? 'Shared' : `Home › ${id.replace(/^users\//, '')}`),
      installed: (id: string) => appNames.has(id),
    };
  }

  /** What a restore point holds, with sizes (US-BKP-18). The system part isn't listed: it comes with everything. */
  async items(destinationId: string, pointId: string) {
    const { repo, snaps, time } = await this.pointSnaps(destinationId, pointId);
    const names = this.labels();
    const items = [];
    for (const s of snaps) {
      const tag = s.tags.find((t) => t.startsWith('app:') || t.startsWith('folder:'));
      if (!tag) continue;
      const kind = tag.startsWith('app:') ? ('app' as const) : ('folder' as const);
      const id = tag.slice(kind.length + 1);
      items.push({
        kind,
        id,
        label: kind === 'app' ? names.app(id) : names.folder(id),
        sizeBytes: s.bytes ?? (await this.deps.restic.restoreSize(repo, s.id).catch(() => null)),
        installed: kind === 'app' ? names.installed(id) : true,
      });
    }
    const point = (await this.points(destinationId)).points.find((p) => p.id === pointId) ?? {
      id: pointId,
      time,
      kind: 'daily' as const,
      bytesChanged: null,
    };
    return { point, items };
  }

  // ------------------------------------------------------------------ starting one

  /** `backups.restore` (US-BKP-19): the admin's password, then the checks, then the job. */
  async start(
    input: { destinationId: string; snapshotId: string; scope: RestoreScope; password: string },
    who: { userId: string; ip: string },
  ) {
    const { db } = this.deps;
    await this.deps.confirmPassword(who.userId, input.password, 'backup.restore', who.ip);
    const { scope } = input;
    if (!scope.apps.length && !scope.folders.length) throw hlabsError('VALIDATION_FAILED', 'Choose what to restore');
    this.deps.jobs.assertCanStart('restore');
    const { repo, snaps, time } = await this.pointSnaps(input.destinationId, input.snapshotId);
    const stored: StoredScope['snaps'] = {};
    let total = 0;
    const want = [
      ...scope.apps.map((id) => ['app', id] as const),
      ...scope.folders.map((id) => ['folder', id] as const),
    ];
    const names = this.labels();
    for (const [kind, id] of want) {
      const snap = snaps.find((s) => s.tags.includes(itemKey(kind, id)));
      if (!snap) throw hlabsError('NOT_FOUND', `${id} isn't in this restore point`);
      if (kind === 'app' && scope.mode === 'replace' && !names.installed(id)) {
        throw hlabsError('VALIDATION_FAILED', `Install ${id} first`, { reason: 'notInstalled', appId: id });
      }
      const bytes = snap.bytes ?? (await this.deps.restic.restoreSize(repo, snap.id).catch(() => 0));
      total += bytes;
      stored[itemKey(kind, id)] = { snapshotId: snap.id, path: snap.paths[0] ?? '', bytes };
    }
    // Everything in the point, replaced: the system part too, and hlabs restarts (US-BKP-18).
    const everything = snaps.filter((s) => s.tags.some((t) => t.startsWith('app:') || t.startsWith('folder:')));
    const system = snaps.find((s) => s.tags.includes('system')) ?? null;
    const wholeSystem = scope.mode === 'replace' && everything.length === want.length && !!system;
    // Staging needs room; the safety copy is a rename and needs none (US-BKP-21).
    const free = await this.deps.freeBytes(scope.mode === 'copy' ? this.homeOf(who.userId) : this.deps.appDataDir);
    if (free < total) {
      throw hlabsError('DISK_FULL', 'Not enough free space to restore safely', { neededBytes: total - free });
    }
    const user = db.select().from(users).where(eq(users.id, who.userId)).get();
    const stamp = new Date(time);
    const copyFolder =
      scope.mode === 'copy'
        ? `Restored/${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')} ${String(stamp.getHours()).padStart(2, '0')}-${String(stamp.getMinutes()).padStart(2, '0')}`
        : null;
    const id = ulid();
    const full: StoredScope = {
      ...scope,
      pointTime: time,
      wholeSystem,
      snaps: stored,
      systemSnap: wholeSystem && system ? { snapshotId: system.id, paths: system.paths } : null,
      copyFolder,
    };
    const steps = this.plannedSteps(full);
    db.transaction((tx) => {
      tx.insert(restores)
        .values({
          id,
          snapshotId: input.snapshotId,
          destinationId: input.destinationId,
          scopeJson: full,
          status: 'running',
          startedAt: this.now(),
          phase: 'checking',
          userId: who.userId,
          stepsJson: steps,
        })
        .run();
      tx.insert(auditLog)
        .values({
          id: ulid(),
          at: this.now(),
          userId: who.userId,
          action: 'backup.restore',
          target: id,
          detailJson: {
            mode: scope.mode,
            apps: scope.apps,
            folders: scope.folders,
            point: input.snapshotId,
            wholeSystem,
          },
          ip: who.ip,
        })
        .run();
    });
    void user;
    const jobId = this.deps.jobs.start<{ restoreId: string }>('restore', { payload: { restoreId: id } });
    db.update(restores).set({ jobId }).where(eq(restores.id, id)).run();
    return { jobId };
  }

  private homeOf(userId: string): string {
    const root = rootLocation(this.deps.db);
    const user = this.deps.db.select().from(users).where(eq(users.id, userId)).get();
    if (!root || !user) throw hlabsError('NOT_FOUND', 'No Home folder');
    return join(root.path, 'users', user.username);
  }

  private plannedSteps(scope: StoredScope): RestoreStep[] {
    const step = (kind: RestoreStep['kind'], appId: string | null = null): RestoreStep => ({
      kind,
      appId,
      state: 'todo',
      startedAt: null,
      finishedAt: null,
      bytesDone: null,
      bytesTotal: null,
    });
    if (scope.mode === 'copy') return [step('copy')];
    const running = new Set(
      this.deps.db
        .select({ id: apps.id })
        .from(apps)
        .where(inArray(apps.id, scope.apps.concat([''])))
        .all()
        .map((a) => a.id),
    );
    const appIds = scope.apps.filter((id) => running.has(id));
    return [
      ...appIds.map((a) => step('stop', a)),
      step('safety'),
      step('copy'),
      ...appIds.map((a) => step('start', a)),
    ];
  }

  // ------------------------------------------------------------------ the job

  private row(id: string): RestoreRow {
    const row = this.deps.db.select().from(restores).where(eq(restores.id, id)).get();
    if (!row) throw hlabsError('NOT_FOUND');
    return row;
  }

  private setPhase(id: string, phase: Phase) {
    this.deps.db.update(restores).set({ phase }).where(eq(restores.id, id)).run();
  }

  /** Moves one step on and tells the dashboard (job.progress carries the overall share). */
  private step(
    id: string,
    match: (s: RestoreStep) => boolean,
    patch: Partial<RestoreStep>,
    report?: (progress: number) => void,
  ) {
    const row = this.row(id);
    const steps = row.stepsJson.map((s) => (match(s) ? { ...s, ...patch } : s));
    this.deps.db.update(restores).set({ stepsJson: steps }).where(eq(restores.id, id)).run();
    if (report) {
      const done = steps.filter((s) => s.state === 'done').length;
      const copy = steps.find((s) => s.kind === 'copy');
      const inCopy = copy?.state === 'running' && copy.bytesTotal ? (copy.bytesDone ?? 0) / copy.bytesTotal : 0;
      report(((done + inCopy) / Math.max(1, steps.length)) * 100);
    }
  }

  private begin(id: string, kind: RestoreStep['kind'], appId: string | null, report: (p: number) => void) {
    this.step(id, (s) => s.kind === kind && s.appId === appId, { state: 'running', startedAt: this.now() }, report);
  }

  private end(id: string, kind: RestoreStep['kind'], appId: string | null, report: (p: number) => void) {
    this.step(id, (s) => s.kind === kind && s.appId === appId, { state: 'done', finishedAt: this.now() }, report);
  }

  /** Where an item is, its staging folder and its safety copy (beside it, so a swap is a rename). */
  private places(restoreId: string, key: string) {
    const [kind, id] = key.split(/:(.*)/s) as ['app' | 'folder', string];
    const root = rootLocation(this.deps.db)?.path ?? '';
    const base = kind === 'app' ? this.deps.appDataDir : root;
    const target = join(base, id);
    const work = join(base, '.restore', restoreId);
    return {
      kind,
      id,
      target,
      staging: join(work, 'staging', safeName(key)),
      safety: join(work, 'safety', safeName(key)),
      work,
    };
  }

  private async run(ctx: JobContext<{ restoreId: string }>) {
    const id = ctx.payload.restoreId;
    const row = this.row(id);
    const scope = row.scopeJson as StoredScope;
    const dest = row.destinationId ? this.deps.destinations.get(row.destinationId) : null;
    if (!dest) throw hlabsError('NOT_FOUND', 'The destination is gone');
    const repo = await this.deps.destinations.repo(dest);
    const report = (p: number) => ctx.report(p);
    try {
      if (scope.mode === 'copy') await this.copy(id, scope, repo, ctx, report);
      else await this.replace(id, scope, repo, ctx, report);
      this.finish(id, 'succeeded', null);
      this.notifyDone(id, scope, true, null);
      if (scope.mode === 'replace' && scope.wholeSystem) setTimeout(() => this.deps.restartDaemon(), 500).unref();
    } catch (err) {
      const cancelled = ctx.signal.aborted;
      const code = cancelled ? null : hlabsCodeOf(err);
      this.deps.logger.warn({ err, restoreId: id }, cancelled ? 'restore cancelled' : 'restore failed');
      this.finish(id, cancelled ? 'cancelled' : 'failed', code);
      if (!cancelled) this.notifyDone(id, scope, false, code);
      throw err;
    }
  }

  private finish(id: string, status: 'succeeded' | 'failed' | 'cancelled', code: HlabsCode | null) {
    this.deps.db
      .update(restores)
      .set({
        status,
        error: code,
        finishedAt: this.now(),
        ...(status === 'succeeded' ? { phase: 'done' as const } : {}),
      })
      .where(eq(restores.id, id))
      .run();
  }

  /** "Restore as a copy": into Home › Restored › <date time> › <item>; nothing stops or is replaced (US-BKP-18). */
  private async copy(
    id: string,
    scope: StoredScope,
    repo: Repo,
    ctx: JobContext<{ restoreId: string }>,
    report: (p: number) => void,
  ) {
    const row = this.row(id);
    const home = this.homeOf(row.userId!);
    const names = this.labels();
    const total = Object.values(scope.snaps).reduce((n, s) => n + s.bytes, 0);
    let done = 0;
    this.setPhase(id, 'copying');
    this.begin(id, 'copy', null, report);
    for (const [key, snap] of Object.entries(scope.snaps)) {
      const [kind, itemId] = key.split(/:(.*)/s) as ['app' | 'folder', string];
      const label = kind === 'app' ? names.app(itemId) : names.folder(itemId).replace(/^Home › /, 'Home - ');
      const target = join(home, scope.copyFolder!, safeName(label));
      mkdirSync(target, { recursive: true });
      await this.deps.restic.restore(
        repo,
        { snapshotId: snap.snapshotId, path: snap.path, target, signal: ctx.signal },
        (p) => this.step(id, (s) => s.kind === 'copy', { bytesDone: done + p.bytesDone, bytesTotal: total }, report),
      );
      done += snap.bytes;
    }
    this.end(id, 'copy', null, report);
  }

  /** "Replace current data" (D-024): stop → safety copy → copy → swap in → start, rolling back on any failure. */
  private async replace(
    id: string,
    scope: StoredScope,
    repo: Repo,
    ctx: JobContext<{ restoreId: string }>,
    report: (p: number) => void,
  ) {
    const keys = Object.keys(scope.snaps);
    const toStart = this.row(id)
      .stepsJson.filter((s) => s.kind === 'start')
      .map((s) => s.appId!);
    const moved: string[] = [];
    const total = Object.values(scope.snaps).reduce((n, s) => n + s.bytes, 0);
    const abortIfCancelled = () => {
      if (ctx.signal.aborted) throw hlabsError('INTERNAL', 'Cancelled');
    };
    try {
      // 1. Stop the apps.
      this.setPhase(id, 'stopping');
      for (const appId of toStart) {
        abortIfCancelled();
        this.begin(id, 'stop', appId, report);
        const state = this.deps.db.select({ state: apps.state }).from(apps).where(eq(apps.id, appId)).get()?.state;
        if (state === 'running') await this.deps.apps.stop(appId);
        this.end(id, 'stop', appId, report);
      }
      // 2. The safety copy: the current data moved aside.
      abortIfCancelled();
      this.setPhase(id, 'safety');
      this.begin(id, 'safety', null, report);
      for (const key of keys) {
        const p = this.places(id, key);
        mkdirSync(dirname(p.safety), { recursive: true });
        if (existsSync(p.target)) {
          renameSync(p.target, p.safety);
          moved.push(key);
        }
      }
      this.end(id, 'safety', null, report);
      // 3. Copy from the destination into staging.
      abortIfCancelled();
      this.setPhase(id, 'copying');
      this.begin(id, 'copy', null, report);
      let done = 0;
      for (const key of keys) {
        const p = this.places(id, key);
        const snap = scope.snaps[key]!;
        mkdirSync(p.staging, { recursive: true });
        await this.deps.restic.restore(
          repo,
          // An app's data goes back with its files' owners as they were (D-190); a Home folder stays hlabs's.
          {
            snapshotId: snap.snapshotId,
            path: snap.path,
            target: p.staging,
            asRoot: p.kind === 'app',
            signal: ctx.signal,
          },
          (prog) =>
            this.step(id, (s) => s.kind === 'copy', { bytesDone: done + prog.bytesDone, bytesTotal: total }, report),
        );
        done += snap.bytes;
      }
      if (scope.systemSnap) await this.stageSystem(id, scope, repo, ctx.signal);
      abortIfCancelled();
      this.end(id, 'copy', null, report);
    } catch (err) {
      await this.rollback(id, keys, moved, toStart, report);
      throw err;
    }
    // 4. Swap in: from here on it finishes (US-BKP-22).
    this.setPhase(id, 'swap');
    for (const key of keys) {
      const p = this.places(id, key);
      await this.remove(p.target, p);
      renameSync(p.staging, p.target);
    }
    if (scope.systemSnap) this.swapSystem(id);
    // 5. Start the apps and wait for them; one that doesn't come up gets its safety copy back.
    this.setPhase(id, 'starting');
    for (const appId of toStart) {
      this.begin(id, 'start', appId, report);
      const health = await this.deps.apps.start(appId).catch(() => ({ ok: false as const }));
      if (!health.ok) {
        this.step(id, (s) => s.kind === 'start' && s.appId === appId, { state: 'failed', finishedAt: this.now() });
        await this.putBackAfterSwap(id, keys, moved, toStart, report);
        throw hlabsError('APP_HEALTH_TIMEOUT', `${appId} didn't start with the restored data`);
      }
      this.end(id, 'start', appId, report);
    }
    // 6. Done: the safety copy and staging go. The apps already run on the restored data, so what can't be deleted
    // is left and logged; it doesn't fail the restore.
    await this.clearWork(id, keys).catch((err) => this.deps.logger.warn({ err, restoreId: id }, 'restore leftovers'));
  }

  /** A folder that can hold what an app wrote as root (Linux): deleted through the app's own image when need be. */
  private async remove(path: string, p: { kind: 'app' | 'folder'; id: string }) {
    if (!existsSync(path)) return;
    if (p.kind === 'app' && this.deps.removeAppFolder) return this.deps.removeAppFolder(p.id, path);
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  /** The restore's safety copies and staging, every item's before the folders they share. */
  private async clearWork(id: string, keys: string[]) {
    for (const key of keys) {
      const p = this.places(id, key);
      await this.remove(p.staging, p);
      await this.remove(p.safety, p);
    }
    for (const key of keys) rmSync(this.places(id, key).work, { recursive: true, force: true });
    rmSync(join(this.deps.dataDir, '.restore', id), { recursive: true, force: true });
  }

  /** Before swap-in: staging discarded, the safety copy moved back, the apps started (US-BKP-21). */
  private async rollback(id: string, keys: string[], moved: string[], toStart: string[], report: (p: number) => void) {
    this.addPutBack(id);
    this.begin(id, 'putBack', null, report);
    for (const key of keys) {
      const p = this.places(id, key);
      if (moved.includes(key) && existsSync(p.safety)) {
        await this.remove(p.target, p);
        renameSync(p.safety, p.target);
      }
    }
    await this.clearWork(id, keys);
    this.end(id, 'putBack', null, report);
    await this.startAgain(toStart);
  }

  /** After swap-in, an app that didn't come up: stopped, the restored data dropped, the safety copy back, started. */
  private async putBackAfterSwap(
    id: string,
    keys: string[],
    moved: string[],
    toStart: string[],
    report: (p: number) => void,
  ) {
    for (const appId of toStart) {
      const state = this.deps.db.select({ state: apps.state }).from(apps).where(eq(apps.id, appId)).get()?.state;
      if (state === 'running') await this.deps.apps.stop(appId).catch(() => {});
    }
    this.addPutBack(id);
    this.begin(id, 'putBack', null, report);
    for (const key of keys) {
      const p = this.places(id, key);
      if (moved.includes(key) && existsSync(p.safety)) {
        await this.remove(p.target, p);
        renameSync(p.safety, p.target);
      }
    }
    await this.clearWork(id, keys);
    this.end(id, 'putBack', null, report);
    await this.startAgain(toStart);
  }

  private addPutBack(id: string) {
    const row = this.row(id);
    if (row.stepsJson.some((s) => s.kind === 'putBack')) return;
    const steps: RestoreStep[] = [
      ...row.stepsJson.filter((s) => s.kind !== 'start' || s.state !== 'todo'),
      {
        kind: 'putBack',
        appId: null,
        state: 'todo',
        startedAt: null,
        finishedAt: null,
        bytesDone: null,
        bytesTotal: null,
      },
      ...row.stepsJson
        .filter((s) => s.kind === 'start')
        .map((s) => ({ ...s, state: 'todo' as const, startedAt: null, finishedAt: null })),
    ];
    this.deps.db.update(restores).set({ stepsJson: steps }).where(eq(restores.id, id)).run();
  }

  private async startAgain(appIds: string[]) {
    for (const appId of appIds) {
      const state = this.deps.db.select({ state: apps.state }).from(apps).where(eq(apps.id, appId)).get()?.state;
      if (state === 'stopped' || state === 'error') {
        await this.deps.apps
          .start(appId)
          .catch((err) => this.deps.logger.warn({ err, appId }, 'could not start again'));
      }
    }
  }

  /** The system part of a whole-system restore, staged beside the data dir. */
  private async stageSystem(id: string, scope: StoredScope, repo: Repo, signal: AbortSignal) {
    const work = join(this.deps.dataDir, '.restore', id);
    for (const path of scope.systemSnap!.paths) {
      const into = join(work, path.endsWith('/apps') || path.endsWith('apps') ? 'apps' : 'staged');
      mkdirSync(into, { recursive: true });
      await this.deps.restic.restore(repo, { snapshotId: scope.systemSnap!.snapshotId, path, target: into, signal });
    }
    // The secrets bundle opens with this destination's password; the secrets go back into the store.
    const bundlePath = join(work, 'staged', 'secrets.bundle');
    if (existsSync(bundlePath)) {
      const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as Record<string, string>;
      const key = scryptSync(repo.env.RESTIC_PASSWORD ?? '', Buffer.from(bundle.salt!, 'base64'), 32, {
        N: 2 ** 15,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
      });
      const d = createDecipheriv('aes-256-gcm', key, Buffer.from(bundle.iv!, 'base64'));
      d.setAuthTag(Buffer.from(bundle.tag!, 'base64'));
      const values = JSON.parse(
        Buffer.concat([d.update(Buffer.from(bundle.data!, 'base64')), d.final()]).toString('utf8'),
      ) as Record<string, string>;
      for (const [ref, value] of Object.entries(values)) await this.deps.secrets.set(ref, value);
    }
  }

  /** The app setup swapped in now; the database left for the next start to put in place (it's open now). */
  private swapSystem(id: string) {
    const work = join(this.deps.dataDir, '.restore', id);
    const appsDir = join(this.deps.dataDir, 'apps');
    if (existsSync(join(work, 'apps'))) {
      rmSync(`${appsDir}.before-restore`, { recursive: true, force: true });
      if (existsSync(appsDir)) renameSync(appsDir, `${appsDir}.before-restore`);
      renameSync(join(work, 'apps'), appsDir);
    }
    const db = join(work, 'staged', 'hlabs.db');
    if (existsSync(db)) renameSync(db, join(this.deps.dataDir, PENDING_DB));
  }

  private notifyDone(id: string, scope: StoredScope, ok: boolean, code: HlabsCode | null) {
    const names = this.labels();
    const labels = Object.keys(scope.snaps).map((k) => {
      const [kind, itemId] = k.split(/:(.*)/s) as ['app' | 'folder', string];
      return kind === 'app' ? names.app(itemId) : names.folder(itemId);
    });
    const what = labels.length === 1 ? labels[0]! : `${labels.length} items`;
    this.deps.notifications.create({
      userId: null,
      kind: ok ? 'restore.succeeded' : 'restore.failed',
      target: id,
      severity: ok ? 'success' : 'warning',
      title: ok ? `${what} restored` : "Restore didn't finish",
      body: ok
        ? scope.mode === 'copy'
          ? `The files are in Home › ${scope.copyFolder!.replace('/', ' › ')}.`
          : null
        : `${what} ${labels.length === 1 ? 'is' : 'are'} back to how ${labels.length === 1 ? 'it was' : 'they were'}.${code ? '' : ''}`,
      actions: [{ kind: 'navigate', to: '/settings/backups' }],
    });
  }

  // ------------------------------------------------------------------ reading, cancelling, crashes

  /** `jobs.cancel` for a restore: only before swap-in (US-BKP-22). */
  assertCancellable(jobId: string) {
    const row = this.deps.db.select().from(restores).where(eq(restores.jobId, jobId)).get();
    if (row && !CANCELLABLE.includes(row.phase)) throw hlabsError('RESTORE_NOT_CANCELLABLE');
  }

  view(row: RestoreRow) {
    const scope = row.scopeJson as StoredScope;
    const names = this.labels();
    const dest = row.destinationId
      ? this.deps.db
          .select({ name: backupDestinations.name })
          .from(backupDestinations)
          .where(eq(backupDestinations.id, row.destinationId))
          .get()
      : undefined;
    return {
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      cancellable: row.status === 'running' && CANCELLABLE.includes(row.phase),
      mode: scope.mode,
      items: [
        ...scope.apps.map((id) => ({ kind: 'app' as const, id, label: names.app(id) })),
        ...scope.folders.map((id) => ({ kind: 'folder' as const, id, label: names.folder(id) })),
      ],
      pointTime: scope.pointTime,
      destinationName: dest?.name ?? null,
      wholeSystem: scope.wholeSystem,
      steps: row.stepsJson,
      error: (row.error as HlabsCode | null) ?? null,
      copyFolder: scope.copyFolder ? `Home › ${scope.copyFolder.replace('/', ' › ')}` : null,
    };
  }

  byJob(jobId: string) {
    const row = this.deps.db.select().from(restores).where(eq(restores.jobId, jobId)).get();
    if (!row) throw hlabsError('NOT_FOUND');
    return this.view(row);
  }

  /** The restore running now, for Backups (US-BKP-20). */
  running() {
    const row = this.deps.db
      .select()
      .from(restores)
      .where(eq(restores.status, 'running'))
      .orderBy(desc(restores.startedAt))
      .get();
    return row ? this.view(row) : null;
  }

  /**
   * After a crash (US-BKP-21): before swap-in, the safety copy goes back and the apps start (failed,
   * BACKUP_INTERRUPTED); from swap-in on, the staged data goes in and the apps start (succeeded).
   */
  async recover() {
    const stuck = this.deps.db.select().from(restores).where(eq(restores.status, 'running')).all();
    for (const row of stuck) {
      const scope = row.scopeJson as StoredScope;
      const keys = Object.keys(scope.snaps);
      const appIds = scope.mode === 'replace' ? scope.apps : [];
      const afterSwap = !CANCELLABLE.includes(row.phase);
      for (const key of keys) {
        const p = this.places(row.id, key);
        if (afterSwap) {
          if (existsSync(p.staging) && !existsSync(p.target)) renameSync(p.staging, p.target);
        } else if (existsSync(p.safety)) {
          await this.remove(p.target, p);
          renameSync(p.safety, p.target);
        }
      }
      await this.clearWork(row.id, keys).catch((err) =>
        this.deps.logger.warn({ err, restoreId: row.id }, 'restore leftovers'),
      );
      await this.startAgain(appIds);
      this.deps.db
        .update(restores)
        .set({
          status: afterSwap ? 'succeeded' : 'failed',
          error: afterSwap ? null : 'BACKUP_INTERRUPTED',
          finishedAt: this.now(),
          ...(afterSwap ? { phase: 'done' as const } : {}),
        })
        .where(eq(restores.id, row.id))
        .run();
    }
  }
}
