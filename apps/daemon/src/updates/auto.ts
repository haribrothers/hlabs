// Automatic updates (US-SYS-26, 02 §2.10, D-026): one window, 03:00–05:00 local time. With "Update hlabs
// automatically" on, an available hlabs update is installed first; with "Update apps automatically" on, then every
// running app allowed to update by itself (its settings) that has a newer version. A running backup or another job
// that can't share the time (D-020) is waited for, still within the window, else it's the next night. Each runs once
// a night (kept in settings, so a restart or a rollback doesn't try again), and a notification says what was updated
// or rolled back.
import { apps, getSetting, setSetting, type HlabsDb } from '@hlabs/db';
import { and, eq } from 'drizzle-orm';
import type { EventBus } from '../events/bus';
import type { JobRunner } from '../jobs/runner';
import type { Logger } from '../logger';
import type { NotificationService } from '../notifications/service';
import type { CatalogService } from '../store/catalog';

export const WINDOW_START_HOUR = 3;
export const WINDOW_END_HOUR = 5;
export const AUTO_TICK_MS = 5 * 60_000;
export const AUTO_UPDATED_KIND = 'updates.auto_ran';

export interface AutoUpdatesDeps {
  db: HlabsDb;
  bus: EventBus;
  jobs: Pick<JobRunner, 'blocker' | 'listActive'>;
  catalog: Pick<CatalogService, 'get'>;
  notifications: Pick<NotificationService, 'create'>;
  logger: Logger;
  /** Whether hlabs has a newer version (the last check), and starting its update (US-SYS-23). */
  hlabs: { available: () => string | null; install: () => void };
  /** Starting one app's update; returns its job. */
  updateApp: (appId: string) => string;
  now?: () => Date;
}

/** The local night a time belongs to, for once-a-night bookkeeping. */
const nightOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const inWindow = (d: Date) => d.getHours() >= WINDOW_START_HOUR && d.getHours() < WINDOW_END_HOUR;

export class AutoUpdates {
  private timer: NodeJS.Timeout | null = null;
  /** Tonight's app update jobs → app name and versions, for the morning's notification. */
  private readonly tonight = new Map<string, { name: string; from: string; to: string }>();
  private readonly results: Array<{ name: string; from: string; to: string; ok: boolean }> = [];

  constructor(private readonly deps: AutoUpdatesDeps) {
    deps.bus.on(({ event }) => {
      if (event.type !== 'job.finished') return;
      const app = this.tonight.get(event.data.jobId);
      if (!app) return;
      this.tonight.delete(event.data.jobId);
      this.results.push({ ...app, ok: event.data.state === 'succeeded' });
      if (this.tonight.size === 0) this.notify();
    });
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), AUTO_TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One look: in the window and nothing to wait for, the next thing due tonight starts. */
  tick(): void {
    const { db, jobs, logger } = this.deps;
    const now = (this.deps.now ?? (() => new Date()))();
    if (!inWindow(now)) return;
    const u = getSetting(db, 'updates');
    const night = nightOf(now);
    const backupRunning = jobs.listActive().some((j) => j.kind === 'backup');
    try {
      if (u.autoHlabs && u.autoNight.hlabs !== night && this.deps.hlabs.available()) {
        if (backupRunning || jobs.blocker('system_update')) return;
        setSetting(db, 'updates', { ...u, autoNight: { ...u.autoNight, hlabs: night } });
        this.deps.hlabs.install();
        return;
      }
      if (u.autoApps && u.autoNight.apps !== night) {
        // hlabs first: its update has to finish (it restarts the daemon) before the apps'.
        if (backupRunning || jobs.listActive().some((j) => j.kind === 'system_update')) return;
        const due = this.dueApps();
        if (due.length === 0) return;
        if (jobs.blocker('app_update')) return;
        setSetting(db, 'updates', { ...getSetting(db, 'updates'), autoNight: { ...u.autoNight, apps: night } });
        for (const app of due) {
          try {
            this.tonight.set(this.deps.updateApp(app.id), app);
          } catch (err) {
            logger.warn({ err, appId: app.id }, 'automatic app update not started');
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'automatic updates failed');
    }
  }

  /** Running apps allowed to update by themselves with a newer version in the store. */
  private dueApps() {
    return this.deps.db
      .select()
      .from(apps)
      .where(and(eq(apps.autoUpdate, true), eq(apps.state, 'running')))
      .all()
      .flatMap((app) => {
        const entry = this.deps.catalog.get(app.id, app.sourceId ?? undefined);
        if (!entry || entry.manifest.version === app.version) return [];
        return [{ id: app.id, name: entry.manifest.name, from: app.version, to: entry.manifest.version }];
      });
  }

  private notify(): void {
    const done = this.results.splice(0);
    const updated = done.filter((r) => r.ok);
    const rolledBack = done.filter((r) => !r.ok);
    const list = (rs: typeof done) => rs.map((r) => `${r.name} ${r.from} → ${r.to}`).join(', ');
    this.deps.notifications.create({
      userId: null,
      kind: AUTO_UPDATED_KIND,
      severity: rolledBack.length ? 'warning' : 'success',
      title: rolledBack.length
        ? `Updated ${updated.length} of ${done.length} apps overnight`
        : `Updated ${updated.length === 1 ? '1 app' : `${updated.length} apps`} overnight`,
      body: [
        updated.length ? `Updated: ${list(updated)}.` : '',
        rolledBack.length ? `Rolled back: ${list(rolledBack)}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      actions: [{ kind: 'navigate', to: '/settings/updates' }],
    });
  }
}
