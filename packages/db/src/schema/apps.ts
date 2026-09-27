import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { bool, id, json, ms } from './columns';
import { users } from './identity';
import { storageLocations } from './storage';

export const APP_SOURCE_KINDS = ['builtin', 'git', 'index', 'local'] as const;

/** The app state machine in docs/prd/02-architecture.md §2.5. */
export const APP_STATES = [
  'installing',
  'install_failed',
  'starting',
  'running',
  'stopping',
  'stopped',
  'restarting',
  'updating',
  'rolling_back',
  'error',
  'uninstalling',
] as const;
export type AppState = (typeof APP_STATES)[number];

export const appSources = sqliteTable('app_sources', {
  id: id(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  kind: text('kind', { enum: APP_SOURCE_KINDS }).notNull(),
  enabled: bool('enabled').notNull().default(true),
  /** Pinned ed25519 key of the source's index signature. */
  publicKey: text('public_key'),
  lastSyncedAt: ms('last_synced_at'),
  lastError: text('last_error'),
});

export const catalogApps = sqliteTable(
  'catalog_apps',
  {
    sourceId: text('source_id')
      .notNull()
      .references(() => appSources.id, { onDelete: 'cascade' }),
    appId: text('app_id').notNull(),
    version: text('version').notNull(),
    manifestJson: json<unknown>('manifest_json').notNull(),
    updatedAt: ms('updated_at').notNull(),
    firstSeenAt: ms('first_seen_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.appId] })],
);

export const apps = sqliteTable('apps', {
  /** = appId */
  id: id(),
  sourceId: text('source_id').references(() => appSources.id, { onDelete: 'set null' }),
  version: text('version').notNull(),
  previousVersion: text('previous_version'),
  state: text('state', { enum: APP_STATES }).notNull(),
  stateDetail: text('state_detail'),
  hostname: text('hostname').notNull().unique(),
  portFallback: integer('port_fallback').unique(),
  autostart: bool('autostart').notNull().default(true),
  autoUpdate: bool('auto_update').notNull().default(false),
  authMode: text('auth_mode', { enum: ['hlabs', 'none'] })
    .notNull()
    .default('hlabs'),
  installedAt: ms('installed_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
  installedBy: text('installed_by').references(() => users.id, { onDelete: 'set null' }),
  custom: bool('custom').notNull().default(false),
  netInternet: bool('net_internet').notNull().default(true),
  netApps: bool('net_apps').notNull().default(true),
  dataLocationId: text('data_location_id').references(() => storageLocations.id, { onDelete: 'set null' }),
});

export const appEnv = sqliteTable(
  'app_env',
  {
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    /** Plain value, or null when the value is a secret held behind secret_ref. */
    value: text('value'),
    secretRef: text('secret_ref'),
    isSecret: bool('is_secret').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.appId, t.key] })],
);

export const appMounts = sqliteTable(
  'app_mounts',
  {
    id: id(),
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    storageLocationId: text('storage_location_id')
      .notNull()
      .references(() => storageLocations.id, { onDelete: 'restrict' }),
    subpath: text('subpath').notNull().default(''),
    mode: text('mode', { enum: ['ro', 'rw'] })
      .notNull()
      .default('rw'),
  },
  (t) => [index('app_mounts_app_idx').on(t.appId)],
);

export const appAccess = sqliteTable(
  'app_access',
  {
    appId: text('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.appId, t.userId] }), index('app_access_user_idx').on(t.userId)],
);

export interface HomeLayoutItem {
  kind: 'app' | 'widget';
  id: string;
}

export const homeLayout = sqliteTable('home_layout', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  itemsJson: json<HomeLayoutItem[]>('items_json').notNull().default([]),
  /** Pinned Dock apps, ordered, max 8 (D-054). */
  dockJson: json<string[]>('dock_json').notNull().default([]),
});
