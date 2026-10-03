// Installing an hlabs update (US-SYS-23, 02 §2.10, D-034): "Update now" starts the exclusive `system_update` job.
// On a Mac or a Linux desktop the menu-bar app applies it: the daemon asks it (`update.applyRequested`) and the job
// runs until the tray stops the daemon to replace it; if the tray hasn't taken over within 10 minutes (not running),
// the job fails with UPDATE_NOT_APPLIED. On a headless Linux server the daemon applies it itself (headless.ts) and
// exits for systemd to start the new version. Either way the job settles on the next start: done when hlabs now runs
// the version it was updating to (the "didn't install" side is US-STATE-03).
import { hlabsError } from '@hlabs/api';
import { auditLog, getSetting, jobs as jobsTable, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { EventBus } from '../events/bus';
import type { JobRunner } from '../jobs/runner';
import { applyHeadless, confirmSwitch, headlessPlatform, readMarker, type HeadlessHost } from './headless';
import type { HlabsUpdates } from './service';
import type { UpdateSource } from './source';

/** How long the menu-bar app has to take an update over. */
export const TRAY_TAKEOVER_MS = 10 * 60_000;

export interface SystemUpdatePayload {
  fromVersion: string;
  version: string;
  userId: string | null;
}

export interface SystemUpdateDeps {
  db: HlabsDb;
  bus: EventBus;
  jobs: JobRunner;
  updates: HlabsUpdates;
  source: UpdateSource;
  /** The version running now. */
  version: string;
  /** Who applies updates here (D-034). */
  mode: 'tray' | 'headless';
  headless: { root: string; host: HeadlessHost; publicKey: string };
  trayTakeoverMs?: number;
}

function audit(db: HlabsDb, action: string, userId: string | null, detail: Record<string, unknown>) {
  db.insert(auditLog).values({ id: ulid(), at: Date.now(), userId, action, target: 'hlabs', detailJson: detail }).run();
}

export function registerSystemUpdate(deps: SystemUpdateDeps): void {
  const { db, bus, jobs } = deps;
  jobs.register<SystemUpdatePayload>('system_update', {
    // Being stopped is how the update ends: the next start settles the job (settleSystemUpdate).
    survivesShutdown: true,
    async run({ jobId, payload, signal, report }) {
      if (deps.mode === 'tray') {
        report(5, 'Waiting for the menu-bar app');
        bus.emit('update.applyRequested', { jobId, version: payload.version });
        // The tray stops the daemon to replace it, so this normally never returns.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, deps.trayTakeoverMs ?? TRAY_TAKEOVER_MS);
          timer.unref();
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            resolve();
          });
        });
        throw hlabsError('UPDATE_NOT_APPLIED', 'the menu-bar app did not apply the update');
      }
      const release = await deps.source.latest(getSetting(db, 'updates').channel);
      const download = release.platforms[headlessPlatform()];
      if (release.version !== payload.version || !download) throw hlabsError('UPDATE_NOT_AVAILABLE');
      await applyHeadless({ ...deps.headless, version: payload.version, download, signal, report });
      bus.emit('system.status', { state: 'updating' });
      deps.headless.host.restart();
      // Settled by the next start, on whichever version systemd starts (survivesShutdown).
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    },
  });
}

/** "Update now": the version the last check found, as an exclusive job (JOB_EXCLUSIVE_RUNNING while one runs). */
export function startSystemUpdate(deps: SystemUpdateDeps, userId: string | null): { jobId: string } {
  const available = deps.updates.status().available;
  if (!available) throw hlabsError('UPDATE_NOT_AVAILABLE');
  const payload: SystemUpdatePayload = { fromVersion: deps.version, version: available.version, userId };
  const jobId = deps.jobs.start<SystemUpdatePayload>('system_update', { target: 'hlabs', payload });
  audit(deps.db, 'system.update_started', userId, { from: deps.version, to: available.version });
  return { jobId };
}

/**
 * On start, before interrupted jobs are failed: an update that was under way finished if hlabs now runs the version
 * it was updating to. Returns the settled job's payload, if any.
 */
export function settleSystemUpdate(db: HlabsDb, version: string): SystemUpdatePayload | null {
  const row = db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.kind, 'system_update'), inArray(jobsTable.state, ['queued', 'running'])))
    .get();
  const payload = row?.payloadJson as SystemUpdatePayload | null | undefined;
  if (!row || !payload || payload.version !== version) return null;
  db.update(jobsTable)
    .set({ state: 'succeeded', progress: 100, message: null, finishedAt: Date.now() })
    .where(eq(jobsTable.id, row.id))
    .run();
  audit(db, 'system.update_finished', payload.userId, { from: payload.fromVersion, to: payload.version });
  return payload;
}

/** Headless: the new version is ready, so its switch stays (the start check won't switch back). */
export function confirmHeadlessSwitch(root: string, version: string): void {
  if (readMarker(root)?.to === version) confirmSwitch(root);
}

/** Whether an update is under way: then a stopping daemon tells every page it's updating (US-STATE-01). */
export function updateUnderway(db: HlabsDb): boolean {
  return !!db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(and(eq(jobsTable.kind, 'system_update'), inArray(jobsTable.state, ['queued', 'running'])))
    .get();
}
