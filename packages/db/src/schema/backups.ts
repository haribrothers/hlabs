import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { bool, id, json, ms } from './columns';

export const BACKUP_DEST_KINDS = ['local', 'smb', 'nfs', 's3', 'sftp', 'hlabs'] as const;
export const BACKUP_RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled'] as const;

export interface Retention {
  daily: number;
  weekly: number;
  monthly: number;
}

/** What every backup copies (D-134): app ids, Home folders (`users/<name>`) and `shared`. */
export interface BackupInclude {
  apps: string[];
  folders: string[];
  /** Apps installed and people added later are ticked as they arrive. */
  includeNewApps: boolean;
}

/** Where a restore is (US-BKP-21): before `swap` it can be cancelled and rolls back; from `swap` on it finishes. */
export const RESTORE_PHASES = ['checking', 'stopping', 'safety', 'copying', 'swap', 'starting', 'done'] as const;

export const backupDestinations = sqliteTable('backup_destinations', {
  id: id(),
  kind: text('kind', { enum: BACKUP_DEST_KINDS }).notNull(),
  name: text('name').notNull(),
  configJson: json<Record<string, unknown>>('config_json').notNull(),
  repoPasswordRef: text('repo_password_ref').notNull(),
  status: text('status').notNull().default('ok'),
  usedBytes: integer('used_bytes'),
  snapshotCount: integer('snapshot_count'),
  createdAt: ms('created_at').notNull(),
});

export const backupPlan = sqliteTable(
  'backup_plan',
  {
    /** Singleton row: always 1. */
    id: integer('id').primaryKey().default(1),
    scheduleCron: text('schedule_cron').notNull().default('0 3 * * *'),
    retentionJson: json<Retention>('retention_json').notNull().default({ daily: 7, weekly: 4, monthly: 6 }),
    /** Null until first saved: everything installed, and new apps too (D-134). */
    includeJson: json<BackupInclude | null>('include_json'),
    enabled: bool('enabled').notNull().default(true),
    pauseApps: bool('pause_apps').notNull().default(true),
  },
  (t) => [check('backup_plan_singleton', sql`${t.id} = 1`)],
);

export const backupRuns = sqliteTable(
  'backup_runs',
  {
    id: id(),
    destinationId: text('destination_id').references(() => backupDestinations.id, { onDelete: 'set null' }),
    startedAt: ms('started_at').notNull(),
    finishedAt: ms('finished_at'),
    status: text('status', { enum: BACKUP_RUN_STATUSES }).notNull(),
    trigger: text('trigger', { enum: ['schedule', 'manual', 'pre_update'] }).notNull(),
    bytesAdded: integer('bytes_added'),
    filesChanged: integer('files_changed'),
    error: text('error'),
    logPath: text('log_path'),
    /** The apps and folders it copied, for "11 apps · 1.2 GB changed" (US-BKP-03). */
    appCount: integer('app_count'),
    folderCount: integer('folder_count'),
    /** The 30-minute retry of a failed scheduled run (D-046). */
    retry: bool('retry').notNull().default(false),
  },
  (t) => [index('backup_runs_started_idx').on(t.startedAt)],
);

export const restores = sqliteTable('restores', {
  id: id(),
  snapshotId: text('snapshot_id').notNull(),
  destinationId: text('destination_id').references(() => backupDestinations.id, { onDelete: 'set null' }),
  scopeJson: json<unknown>('scope_json').notNull(),
  status: text('status', { enum: BACKUP_RUN_STATUSES }).notNull(),
  startedAt: ms('started_at').notNull(),
  finishedAt: ms('finished_at'),
  error: text('error'),
  jobId: text('job_id'),
  /** How far it got, for rollback after a crash (US-BKP-21). */
  phase: text('phase', { enum: RESTORE_PHASES }).notNull().default('checking'),
  /** The person who started it ("Restored" goes in their Home for a copy). */
  userId: text('user_id'),
  /** Each step as the progress screen shows it (US-BKP-20). */
  stepsJson: json<RestoreStep[]>('steps_json').notNull().default([]),
});

/** One step of a restore (US-BKP-20): stop an app, the safety copy, copying, start an app, or putting things back. */
export interface RestoreStep {
  kind: 'stop' | 'safety' | 'copy' | 'start' | 'putBack';
  /** The app it's about (stop, start), or null. */
  appId: string | null;
  state: 'todo' | 'running' | 'done' | 'failed';
  startedAt: number | null;
  finishedAt: number | null;
  bytesDone: number | null;
  bytesTotal: number | null;
}
