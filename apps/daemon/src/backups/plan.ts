// The backup plan (US-BKP-23, D-134): when backups run, how long restore points are kept, and what every backup
// copies: installed apps, each Home folder (`users/<name>`) and Shared. Until it's first saved, everything is included
// and new apps are too. The system part (02 §2.9) is always copied.
import type { AppManifest } from '@hlabs/app-manifest';
import { apps, backupPlan, getSetting, users, type BackupInclude, type HlabsDb } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { rootLocation } from '../apps/folders';
import { catalogManifest } from '../apps/list';
import { folderBytes } from '../apps/disk';
import { interval, nextRun } from './cron';
import type { Retention } from './restic';

export type PlanRow = typeof backupPlan.$inferSelect;

export interface BackupItem {
  kind: 'app' | 'folder';
  id: string;
  label: string;
  /** Where it is on this computer. */
  path: string;
}

/** The plan's row, made with its defaults the first time. */
export function planRow(db: HlabsDb): PlanRow {
  const row = db.select().from(backupPlan).get();
  if (row) return row;
  db.insert(backupPlan).values({ id: 1 }).onConflictDoNothing().run();
  return db.select().from(backupPlan).get()!;
}

/** Installed apps (not those still installing for the first time), A to Z by name. */
export function installedApps(db: HlabsDb) {
  return db
    .select()
    .from(apps)
    .all()
    .filter((a) => a.state !== 'installing' || a.installedAt !== null)
    .map((a) => ({ row: a, name: catalogManifest(db, a).name ?? a.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Each Home folder on the storage root (by its person's name when they still exist) and Shared. */
export function homeFolders(db: HlabsDb): Array<{ id: string; label: string; path: string }> {
  const root = rootLocation(db);
  if (!root) return [];
  const names = new Map(
    db
      .select()
      .from(users)
      .all()
      .map((u) => [u.username, u.displayName]),
  );
  const homes = join(root.path, 'users');
  const dirs = existsSync(homes)
    ? readdirSync(homes, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => d.name)
    : [];
  // People whose Home isn't made yet still count: it's made the first time they open Files.
  for (const username of names.keys()) if (!dirs.includes(username)) dirs.push(username);
  const out = dirs
    .map((name) => ({ id: `users/${name}`, label: `Home › ${names.get(name) ?? name}`, path: join(homes, name) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  out.push({ id: 'shared', label: 'Shared', path: join(root.path, 'shared') });
  return out;
}

/** The include list as saved, or everything (D-134). */
export function includeOf(db: HlabsDb, row = planRow(db)): BackupInclude {
  if (row.includeJson) return row.includeJson;
  return {
    apps: installedApps(db).map((a) => a.row.id),
    folders: homeFolders(db).map((f) => f.id),
    includeNewApps: true,
  };
}

/** What a run copies, in order: apps, then folders. Unknown ids (an app uninstalled since) are skipped. */
export function includedItems(db: HlabsDb, appDataDir: string, include = includeOf(db)): BackupItem[] {
  const appIds = new Set(include.apps);
  const folderIds = new Set(include.folders);
  return [
    ...installedApps(db)
      .filter((a) => appIds.has(a.row.id))
      .map((a) => ({ kind: 'app' as const, id: a.row.id, label: a.name, path: join(appDataDir, a.row.id) })),
    ...homeFolders(db)
      .filter((f) => folderIds.has(f.id))
      .map((f) => ({ kind: 'folder' as const, ...f })),
  ];
}

/** "Include new apps automatically": an app installed or a person added later is ticked (D-134). */
export function includeNew(db: HlabsDb, item: { app?: string; folder?: string }) {
  const row = planRow(db);
  if (!row.includeJson || !row.includeJson.includeNewApps) return;
  const next = { ...row.includeJson };
  if (item.app && !next.apps.includes(item.app)) next.apps = [...next.apps, item.app];
  if (item.folder && !next.folders.includes(item.folder)) next.folders = [...next.folders, item.folder];
  db.update(backupPlan).set({ includeJson: next }).where(eq(backupPlan.id, 1)).run();
}

/** "library excluded" from a manifest's `backup.exclude` (US-BKP-23). */
export function excludedLabel(manifest: Pick<AppManifest, 'backup'> | null): string | null {
  const list = manifest?.backup?.exclude ?? [];
  if (!list.length) return null;
  return `${list.map((e) => e.replace(/\/+$/, '')).join(', ')} excluded`;
}

export function retentionOf(row: PlanRow): Retention {
  return row.retentionJson;
}

/** When the next scheduled backup is; null when they're off. */
export function nextRunAt(row: PlanRow, now: number): number | null {
  return row.enabled ? nextRun(row.scheduleCron, now) : null;
}

/** No success in more than twice the schedule's interval (US-BKP-01). */
export function isOverdue(row: PlanRow, lastSuccessAt: number | null, firstRunAt: number | null, now: number) {
  if (!row.enabled) return false;
  const every = interval(row.scheduleCron, now);
  if (every === null) return false;
  const since = lastSuccessAt ?? firstRunAt;
  return since !== null && now - since > 2 * every;
}

/** Sizes of what can be ticked, counted at most every few minutes (US-BKP-23). */
export class PlanSizes {
  private cache = new Map<string, { at: number; bytes: number }>();

  async bytes(path: string, now = Date.now()): Promise<number> {
    const hit = this.cache.get(path);
    if (hit && now - hit.at < 5 * 60_000) return hit.bytes;
    const bytes = await folderBytes(path);
    this.cache.set(path, { at: now, bytes });
    return bytes;
  }
}

/** The plan as Backups' "What's included" reads it; `manifestOf` reads an installed app's manifest copy. */
export async function planView(
  db: HlabsDb,
  appDataDir: string,
  sizes: PlanSizes,
  manifestOf: (appId: string) => Pick<AppManifest, 'backup'> | null,
  now = Date.now(),
) {
  const row = planRow(db);
  const include = includeOf(db, row);
  const appList = await Promise.all(
    installedApps(db).map(async (a) => ({
      kind: 'app' as const,
      id: a.row.id,
      label: a.name,
      sizeBytes: await sizes.bytes(join(appDataDir, a.row.id)),
      excluded: excludedLabel(manifestOf(a.row.id)),
    })),
  );
  const folders = await Promise.all(
    homeFolders(db).map(async (f) => ({
      kind: 'folder' as const,
      id: f.id,
      label: f.label,
      sizeBytes: await sizes.bytes(f.path),
    })),
  );
  return {
    scheduleCron: row.scheduleCron,
    retention: row.retentionJson,
    include,
    enabled: row.enabled,
    pauseApps: row.pauseApps,
    nextRunAt: nextRunAt(row, now),
    apps: appList,
    folders,
  };
}

/** The schedule's progress (settings.backupSchedule). */
export const scheduleState = (db: HlabsDb) => getSetting(db, 'backupSchedule');
