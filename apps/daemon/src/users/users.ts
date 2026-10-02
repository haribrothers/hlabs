// The people who use hlabs (09-account-people.md, F-ACCT-05): what an admin sees and changes in Settings › Users.
import type { UserSummary } from '@hlabs/api';
import { appAccess, sessions, users, userTotp, type HlabsDb } from '@hlabs/db';
import { asc, count, isNotNull, max } from 'drizzle-orm';

/**
 * Everyone, admins first, then by when they joined (US-ACCT-13). Last active is the later of the last log-in and the
 * last request on any of their sessions.
 */
export function listUsers(db: HlabsDb): UserSummary[] {
  const seen = new Map(
    db
      .select({ userId: sessions.userId, at: max(sessions.lastSeenAt) })
      .from(sessions)
      .groupBy(sessions.userId)
      .all()
      .map((r) => [r.userId, r.at]),
  );
  const apps = new Map(
    db
      .select({ userId: appAccess.userId, n: count() })
      .from(appAccess)
      .groupBy(appAccess.userId)
      .all()
      .map((r) => [r.userId, r.n]),
  );
  const totp = new Set(
    db
      .select({ userId: userTotp.userId })
      .from(userTotp)
      .where(isNotNull(userTotp.enabledAt))
      .all()
      .map((r) => r.userId),
  );
  return db
    .select()
    .from(users)
    .orderBy(asc(users.createdAt))
    .all()
    .sort((a, b) => Number(a.role !== 'admin') - Number(b.role !== 'admin'))
    .map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      avatarColor: u.avatarColor,
      totpEnabled: totp.has(u.id),
      lastActiveAt: Math.max(u.lastActiveAt ?? 0, seen.get(u.id) ?? 0) || null,
      disabled: u.disabledAt !== null,
      appCount: apps.get(u.id) ?? 0,
    }));
}
