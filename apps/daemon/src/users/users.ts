// The people who use hlabs (09-account-people.md, F-ACCT-05): what an admin sees and changes in Settings › Users.
import { hlabsError, type UserSummary } from '@hlabs/api';
import { appAccess, apps, auditLog, sessions, users, userTotp, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { asc, count, eq, inArray, isNotNull, max } from 'drizzle-orm';
import type { EventBus } from '../events/bus';

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

interface Who {
  userId: string;
  ip: string | null;
}

function userRow(db: HlabsDb, userId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw hlabsError('NOT_FOUND');
  return user;
}

/** One person with what they can open (US-ACCT-24, US-ACCT-25). */
export function getUser(db: HlabsDb, userId: string) {
  const user = userRow(db, userId);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    avatarColor: user.avatarColor,
    appIds: db
      .select({ appId: appAccess.appId })
      .from(appAccess)
      .where(eq(appAccess.userId, userId))
      .all()
      .map((r) => r.appId),
    canSeeShared: user.canSeeShared,
    canSeeUsage: user.canSeeUsage,
  };
}

/**
 * Replaces what someone can open, and their Shared folder and live usage switches, in one transaction (US-ACCT-24,
 * US-ACCT-25). Apps that aren't installed are ignored. Their open dashboards hear `access.changed` and refetch, and
 * forward auth forgets its answers for them, so it applies straight away (US-ACCT-26).
 */
export function setAppAccess(
  deps: { db: HlabsDb; bus: EventBus },
  input: { userId: string; appIds: string[]; canSeeShared?: boolean; canSeeUsage?: boolean },
  who: Who,
  now = Date.now(),
) {
  const { db } = deps;
  userRow(db, input.userId);
  const wanted = [...new Set(input.appIds)];
  const installed = wanted.length
    ? db
        .select({ id: apps.id })
        .from(apps)
        .where(inArray(apps.id, wanted))
        .all()
        .map((a) => a.id)
    : [];
  db.transaction((tx) => {
    tx.delete(appAccess).where(eq(appAccess.userId, input.userId)).run();
    if (installed.length)
      tx.insert(appAccess)
        .values(installed.map((appId) => ({ appId, userId: input.userId })))
        .run();
    const set: Partial<typeof users.$inferInsert> = {};
    if (input.canSeeShared !== undefined) set.canSeeShared = input.canSeeShared;
    if (input.canSeeUsage !== undefined) set.canSeeUsage = input.canSeeUsage;
    if (Object.keys(set).length) tx.update(users).set(set).where(eq(users.id, input.userId)).run();
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId: who.userId,
        action: 'users.setAppAccess',
        target: input.userId,
        detailJson: { appIds: installed, ...set },
        ip: who.ip,
      })
      .run();
  });
  deps.bus.emit('access.changed', { userId: input.userId }, { kind: 'user', userId: input.userId });
}
