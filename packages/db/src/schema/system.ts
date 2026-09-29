import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { id, json, ms } from './columns';
import { users } from './identity';

export const JOB_STATES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export const NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'critical'] as const;

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: json<unknown>('value_json').notNull(),
});

export const jobs = sqliteTable(
  'jobs',
  {
    id: id(),
    kind: text('kind').notNull(),
    target: text('target'),
    state: text('state', { enum: JOB_STATES }).notNull(),
    progress: integer('progress').notNull().default(0),
    message: text('message'),
    /** hlabsCode of a failed job, for the UI to map to copy. */
    errorCode: text('error_code'),
    payloadJson: json<unknown>('payload_json'),
    createdAt: ms('created_at').notNull(),
    finishedAt: ms('finished_at'),
  },
  (t) => [index('jobs_state_idx').on(t.state)],
);

export type NotificationAction =
  | { kind: 'navigate'; to: string; params?: Record<string, unknown> }
  | { kind: 'mutation'; procedure: string; input: unknown; label: string };

export const notifications = sqliteTable(
  'notifications',
  {
    id: id(),
    /** Null = all admins. */
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    severity: text('severity', { enum: NOTIFICATION_SEVERITIES }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** Up to two buttons (US-STATE-15). */
    actionJson: json<NotificationAction[]>('action_json'),
    createdAt: ms('created_at').notNull(),
    readAt: ms('read_at'),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    at: ms('at').notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    target: text('target'),
    detailJson: json<Record<string, unknown>>('detail_json'),
    ip: text('ip'),
  },
  (t) => [index('audit_log_at_idx').on(t.at)],
);

export const usageSamples = sqliteTable(
  'usage_samples',
  {
    ts: ms('ts').notNull(),
    resolution: text('resolution', { enum: ['1m', '1h'] }).notNull(),
    /** 'host' or an appId. */
    scope: text('scope').notNull(),
    cpu: real('cpu'),
    memBytes: integer('mem_bytes'),
    netRx: integer('net_rx'),
    netTx: integer('net_tx'),
    diskRead: integer('disk_read'),
    diskWrite: integer('disk_write'),
  },
  (t) => [primaryKey({ columns: [t.scope, t.resolution, t.ts] })],
);

export const mcpTokens = sqliteTable('mcp_tokens', {
  id: id(),
  name: text('name').notNull(),
  /** SHA-256 of the token. */
  tokenHash: text('token_hash').notNull().unique(),
  scopesJson: json<string[]>('scopes_json').notNull(),
  createdAt: ms('created_at').notNull(),
  lastUsedAt: ms('last_used_at'),
  revokedAt: ms('revoked_at'),
});
