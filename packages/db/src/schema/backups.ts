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

export interface BackupInclude {
  apps: string[] | 'all';
  homeFolders: string[] | 'all';
}

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
    includeJson: json<BackupInclude>('include_json').notNull().default({ apps: 'all', homeFolders: 'all' }),
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
});
