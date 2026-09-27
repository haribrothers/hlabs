import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, id, json, ms } from './columns';
import { users } from './identity';

export const STORAGE_KINDS = ['local', 'external', 'smb', 'nfs'] as const;

export const storageLocations = sqliteTable(
  'storage_locations',
  {
    id: id(),
    kind: text('kind', { enum: STORAGE_KINDS }).notNull(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    mountOptions: text('mount_options'),
    secretRef: text('secret_ref'),
    isRoot: bool('is_root').notNull().default(false),
    status: text('status').notNull().default('ok'),
    lastSeenAt: ms('last_seen_at'),
    autoMount: bool('auto_mount').notNull().default(true),
    appsAllowed: bool('apps_allowed').notNull().default(true),
  },
  // At most one root here; "exactly one" is enforced in the service (04 invariant 4).
  (t) => [
    uniqueIndex('storage_locations_one_root_idx')
      .on(t.isRoot)
      .where(sql`${t.isRoot} = 1`),
  ],
);

export const fileShares = sqliteTable('file_shares', {
  id: id(),
  path: text('path').notNull(),
  protocol: text('protocol', { enum: ['smb'] })
    .notNull()
    .default('smb'),
  name: text('name').notNull().unique(),
  readOnly: bool('read_only').notNull().default(false),
  usersJson: json<string[]>('users_json').notNull().default([]),
});

export const trashItems = sqliteTable(
  'trash_items',
  {
    id: id(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalPath: text('original_path').notNull(),
    trashPath: text('trash_path').notNull(),
    deletedAt: ms('deleted_at').notNull(),
    size: integer('size').notNull().default(0),
  },
  (t) => [index('trash_items_owner_idx').on(t.ownerUserId, t.deletedAt)],
);

export const uploadSessions = sqliteTable('upload_sessions', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  size: integer('size').notNull(),
  received: integer('received').notNull().default(0),
  createdAt: ms('created_at').notNull(),
});
