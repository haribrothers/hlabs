// A person's own account (09-account-people.md): what Settings › Account shows, and changes to the profile.
import { hlabsError } from '@hlabs/api';
import { auditLog, recoveryCodes, users, userTotp, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';

export function getAccount(db: HlabsDb, userId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw hlabsError('AUTH_REQUIRED');
  const totp = db.select().from(userTotp).where(eq(userTotp.userId, userId)).get();
  const unused = db
    .select({ id: recoveryCodes.id })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)))
    .all().length;
  const admin = db
    .select({ displayName: users.displayName })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
    .orderBy(asc(users.createdAt))
    .get();
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    avatarColor: user.avatarColor,
    locale: user.locale,
    passwordChangedAt: user.passwordChangedAt,
    totpEnabledAt: totp?.enabledAt ?? null,
    recoveryCodesUnused: unused,
    homeFolderBytes: null,
    adminName: admin?.displayName ?? null,
  };
}

/** Display name (trimmed, 1–40), avatar colour and language; audited as `account.update` (US-ACCT-03). */
export function updateAccount(
  db: HlabsDb,
  userId: string,
  change: { displayName?: string; avatarColor?: string; locale?: string },
  opts: { ip: string | null; now?: number },
) {
  const set = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
  if (Object.keys(set).length === 0) return;
  const now = opts.now ?? Date.now();
  db.transaction((tx) => {
    tx.update(users).set(set).where(eq(users.id, userId)).run();
    tx.insert(auditLog)
      .values({ id: ulid(), at: now, userId, action: 'account.update', target: userId, detailJson: set, ip: opts.ip })
      .run();
  });
}
