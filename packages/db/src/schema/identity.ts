import { index, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { bool, id, ms } from './columns';

export const USER_ROLES = ['admin', 'member'] as const;

export const users = sqliteTable('users', {
  id: id(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarColor: text('avatar_color'),
  locale: text('locale').notNull().default('en'),
  createdAt: ms('created_at').notNull(),
  lastActiveAt: ms('last_active_at'),
  disabledAt: ms('disabled_at'),
  passwordChangedAt: ms('password_changed_at'),
  canSeeShared: bool('can_see_shared').notNull().default(false),
  canSeeUsage: bool('can_see_usage').notNull().default(false),
  sharePasswordRef: text('share_password_ref'),
});

export const userTotp = sqliteTable('user_totp', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  secretRef: text('secret_ref').notNull(),
  enabledAt: ms('enabled_at'),
});

export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: ms('used_at'),
  },
  (t) => [index('recovery_codes_user_idx').on(t.userId)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the random 32-byte session id; the raw id only lives in the cookie. */
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: ms('created_at').notNull(),
    lastSeenAt: ms('last_seen_at').notNull(),
    expiresAt: ms('expires_at').notNull(),
    remember: bool('remember').notNull().default(false),
    userAgent: text('user_agent'),
    ip: text('ip'),
    revokedAt: ms('revoked_at'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    id: id(),
    username: text('username').notNull(),
    ip: text('ip').notNull(),
    at: ms('at').notNull(),
    success: bool('success').notNull(),
  },
  (t) => [index('login_attempts_lookup_idx').on(t.username, t.ip, t.at)],
);

export const invites = sqliteTable('invites', {
  id: id(),
  tokenHash: text('token_hash').notNull().unique(),
  /** Keychain ref so an admin can copy the link again while it's pending. */
  tokenRef: text('token_ref'),
  role: text('role', { enum: USER_ROLES }).notNull(),
  displayName: text('display_name'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: ms('created_at').notNull(),
  expiresAt: ms('expires_at').notNull(),
  usedAt: ms('used_at'),
  revokedAt: ms('revoked_at'),
});

export const inviteAppAccess = sqliteTable(
  'invite_app_access',
  {
    inviteId: text('invite_id')
      .notNull()
      .references(() => invites.id, { onDelete: 'cascade' }),
    appId: text('app_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.inviteId, t.appId] })],
);

export const passwordResets = sqliteTable(
  'password_resets',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null for tray resets, which apply directly without a link. */
    tokenHash: text('token_hash'),
    createdVia: text('created_via', { enum: ['tray', 'admin'] }).notNull(),
    expiresAt: ms('expires_at').notNull(),
    usedAt: ms('used_at'),
  },
  (t) => [uniqueIndex('password_resets_token_idx').on(t.tokenHash)],
);
