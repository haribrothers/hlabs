// App updates for the App Store's Updates (US-STORE-15) and Settings › Updates (US-SYS-25): every installed store app
// whose listing has a newer version or revision, with that version's release notes, when it reached the store and what
// new access it asks for (US-STORE-16); the updates that rolled back (US-STORE-17) until dismissed; and the updates
// that finished in the last 14 days. Custom apps never appear.
import type { StoreUpdates } from '@hlabs/api';
import { AppManifest, isNewer, newAccess } from '@hlabs/app-manifest';
import { apps, getSetting, jobs, type HlabsDb } from '@hlabs/db';
import { and, desc, eq, gte } from 'drizzle-orm';
import { appSummary, catalogRow } from '../apps/list';
import type { AppService } from '../apps/service';
import type { UpdatePayload, UpdateService } from '../apps/update';

/** How long a finished update stays under "Recently updated". */
export const RECENT_MS = 14 * 24 * 60 * 60_000;

/** Apps being installed or removed have nothing to update yet. */
const SETTLED = (state: string) => state !== 'installing' && state !== 'install_failed' && state !== 'uninstalling';

type InstalledManifest = (appId: string) => AppManifest | null;

/** The manifest copy an installed app runs from, or null when it can't be read. */
export const installedManifests =
  (appService: Pick<AppService, 'manifest'>): InstalledManifest =>
  (appId) => {
    try {
      return appService.manifest(appId);
    } catch {
      return null;
    }
  };

/** The Updates list as the daemon's services see it. */
export const appUpdatesOf = (s: { db: HlabsDb; updates: Pick<UpdateService, 'rolledBack'>; apps: AppService }) =>
  listAppUpdates(s.db, s.updates, { installed: installedManifests(s.apps) });

/** One installed app's pending update, or null: its store manifest, versions and the access it adds. */
export function pendingUpdate(db: HlabsDb, app: typeof apps.$inferSelect, installed: InstalledManifest) {
  // Custom apps never update; one whose source was removed has none to update from (US-STORE-18).
  if (app.custom || app.sourceId === null || !SETTLED(app.state)) return null;
  const row = catalogRow(db, app);
  if (!row) return null;
  const parsed = AppManifest.safeParse(row.manifestJson);
  if (!parsed.success) return null;
  const store = parsed.data;
  const current = installed(app.id);
  if (!isNewer({ version: app.version, revision: current?.revision ?? 0 }, store)) return null;
  return { app, store, row, newAccess: current ? newAccess(current, store) : null };
}

export function listAppUpdates(
  db: HlabsDb,
  updates: Pick<UpdateService, 'rolledBack'>,
  opts: { installed?: InstalledManifest; now?: number } = {},
): StoreUpdates {
  const installedManifest = opts.installed ?? (() => null);
  const now = opts.now ?? Date.now();
  const all = db.select().from(apps).all();
  const pending = all.flatMap((app) => {
    const u = pendingUpdate(db, app, installedManifest);
    if (!u) return [];
    const { name, icon, state } = appSummary(db, app);
    return [
      {
        appId: app.id,
        name,
        icon,
        state,
        fromVersion: app.version,
        toVersion: u.store.version,
        releaseNotes: u.store.releaseNotes?.trim() || null,
        releasedAt: u.row.versionSeenAt || u.row.updatedAt,
        newAccess: u.newAccess,
      },
    ];
  });
  const rolledBack = all.flatMap((app) => {
    const r = updates.rolledBack(app.id);
    return r
      ? [
          {
            appId: app.id,
            name: appSummary(db, app).name,
            fromVersion: r.fromVersion,
            toVersion: r.toVersion,
            restored: r.restored,
          },
        ]
      : [];
  });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  return {
    pending: pending.sort(byName),
    rolledBack: rolledBack.sort(byName),
    recent: recentUpdates(db, all, now),
    lastCheckedAt: getSetting(db, 'updates').lastCheckedAt,
  };
}

/** The latest update of each installed app that finished in the last 14 days, newest first. */
function recentUpdates(db: HlabsDb, installed: Array<typeof apps.$inferSelect>, now: number) {
  const byId = new Map(installed.map((a) => [a.id, a]));
  const seen = new Set<string>();
  return db
    .select()
    .from(jobs)
    .where(and(eq(jobs.kind, 'app_update'), eq(jobs.state, 'succeeded'), gte(jobs.finishedAt, now - RECENT_MS)))
    .orderBy(desc(jobs.finishedAt))
    .all()
    .flatMap((job) => {
      const app = job.target ? byId.get(job.target) : undefined;
      if (!app || app.custom || seen.has(app.id)) return [];
      seen.add(app.id);
      const payload = (job.payloadJson ?? {}) as Partial<UpdatePayload>;
      const { name, icon } = appSummary(db, app);
      return [
        {
          appId: app.id,
          name,
          icon,
          version: payload.toVersion ?? app.version,
          at: job.finishedAt!,
          automatic: payload.trigger === 'auto' || (payload.trigger === undefined && payload.userId === null),
          notBackedUp: payload.backedUp === false,
        },
      ];
    });
}
