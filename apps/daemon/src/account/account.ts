// A person's own account (09-account-people.md): what Settings › Account shows, and changes to the profile.
import { hlabsError } from '@hlabs/api';
import { auditLog, getSetting, recoveryCodes, users, userTotp, type HlabsDb } from '@hlabs/db';
import { passwordIssue, ulid } from '@hlabs/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { LoginService } from '../auth/login';
import { hashPassword } from '../auth/passwords';
import type { SessionService } from '../auth/sessions';

/** Who manages hlabs, as members are told: the earliest-created enabled admin (US-ACCT-27, US-HOME-12). */
export function managingAdminName(db: HlabsDb): string | null {
  return (
    db
      .select({ displayName: users.displayName })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)))
      .orderBy(asc(users.createdAt))
      .get()?.displayName ?? null
  );
}

export function getAccount(db: HlabsDb, userId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw hlabsError('AUTH_REQUIRED');
  const totp = db.select().from(userTotp).where(eq(userTotp.userId, userId)).get();
  const codes = db
    .select({ usedAt: recoveryCodes.usedAt })
    .from(recoveryCodes)
    .where(eq(recoveryCodes.userId, userId))
    .orderBy(asc(recoveryCodes.id))
    .all();
  const setupDone = getSetting(db, 'onboarding').completedAt;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    avatarColor: user.avatarColor,
    locale: user.locale,
    passwordChangedAt: user.passwordChangedAt,
    totpEnabledAt: totp?.enabledAt ?? null,
    recoveryCodesUnused: codes.filter((c) => c.usedAt === null).length,
    recoveryCodesUsed: codes.map((c) => c.usedAt !== null),
    totpAddedDuringSetup: totp?.enabledAt != null && (setupDone === null || totp.enabledAt <= setupDone),
    totpRequired: getSetting(db, 'people').requireTotp,
    hostname: getSetting(db, 'hostname'),
    homeFolderBytes: null,
    adminName: managingAdminName(db),
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

/**
 * Change my password (US-ACCT-06, 07 §7.2/§7.3): the current one must match; the new one follows the password rule
 * and differs from the current one. Every other session of mine ends (and hears `session.revoked`); this one stays.
 */
export async function changePassword(
  db: HlabsDb,
  services: { sessions: SessionService; login: LoginService },
  who: { userId: string; sessionId: string },
  input: { currentPassword: string; newPassword: string },
  opts: { ip: string; now?: number },
) {
  const user = db.select().from(users).where(eq(users.id, who.userId)).get();
  if (!user) throw hlabsError('AUTH_REQUIRED');
  // A wrong current password counts toward the log-in lockout (US-ACCT-07).
  await services.login.confirmPassword({
    user,
    password: input.currentPassword,
    action: 'changePassword',
    ip: opts.ip,
    now: opts.now,
  });
  const issue = passwordIssue(input.newPassword);
  if (issue === 'tooShort') throw hlabsError('PASSWORD_TOO_SHORT');
  if (issue === 'tooCommon') throw hlabsError('PASSWORD_TOO_COMMON');
  if (input.newPassword === input.currentPassword) throw hlabsError('PASSWORD_UNCHANGED');

  const passwordHash = await hashPassword(input.newPassword);
  const now = opts.now ?? Date.now();
  db.transaction((tx) => {
    tx.update(users).set({ passwordHash, passwordChangedAt: now }).where(eq(users.id, who.userId)).run();
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId: who.userId,
        action: 'account.changePassword',
        target: who.userId,
        detailJson: null,
        ip: opts.ip,
      })
      .run();
  });
  return services.sessions.revoke({ userId: who.userId, except: who.sessionId }, now).length;
}
