// The people who use hlabs (09-account-people.md, F-ACCT-05): what an admin sees and changes in Settings › Users.
import { hlabsError, type UserSummary } from '@hlabs/api';
import { appAccess, apps, auditLog, sessions, users, userTotp, type HlabsDb } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { and, asc, count, eq, inArray, isNotNull, isNull, max, ne } from 'drizzle-orm';
import type { SessionService } from '../auth/sessions';
import { totpSecretRef } from '../auth/totp';
import type { JobRunner } from '../jobs/runner';
import type { SecretStore } from '../platform/secrets';
import { homeFolderBytes, homeFolderPath } from '../storage/home-folder';
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
    homeFolderBytes: homeFolderBytes(db, user.username),
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

type Tx = Parameters<Parameters<HlabsDb['transaction']>[0]>[0];

/** 04 invariant 1: some enabled admin other than `userId` remains. */
function anotherEnabledAdmin(tx: Tx, userId: string): boolean {
  return (
    tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt), ne(users.id, userId)))
      .get() !== undefined
  );
}

function audit(tx: Tx, who: Who, action: string, target: string, detail: Record<string, unknown> | null, now: number) {
  tx.insert(auditLog)
    .values({ id: ulid(), at: now, userId: who.userId, action, target, detailJson: detail, ip: who.ip })
    .run();
}

/**
 * Make someone an admin or a member (US-ACCT-15). Their app access is kept (and ignored while they're an admin).
 * Never leaves hlabs without an enabled admin (LAST_ADMIN). What they can open changes, so their dashboards refetch.
 */
export function updateRole(
  deps: { db: HlabsDb; bus: EventBus },
  input: { userId: string; role: 'admin' | 'member' },
  who: Who,
  now = Date.now(),
) {
  const user = userRow(deps.db, input.userId);
  if (user.role === input.role) return;
  deps.db.transaction((tx) => {
    if (input.role === 'member' && user.disabledAt === null && !anotherEnabledAdmin(tx, user.id))
      throw hlabsError('LAST_ADMIN');
    tx.update(users).set({ role: input.role }).where(eq(users.id, user.id)).run();
    audit(tx, who, 'users.updateRole', user.id, { from: user.role, to: input.role }, now);
  });
  deps.bus.emit('access.changed', { userId: user.id }, { kind: 'user', userId: user.id });
}

/** Block someone for now (US-ACCT-15): every session ends, and logging in fails as a wrong password would. */
export function disableUser(
  deps: { db: HlabsDb; sessions: SessionService },
  userId: string,
  who: Who,
  now = Date.now(),
) {
  const user = userRow(deps.db, userId);
  if (user.disabledAt !== null) return;
  deps.db.transaction((tx) => {
    if (user.role === 'admin' && !anotherEnabledAdmin(tx, user.id)) throw hlabsError('LAST_ADMIN');
    tx.update(users).set({ disabledAt: now }).where(eq(users.id, user.id)).run();
    audit(tx, who, 'users.disable', user.id, null, now);
  });
  deps.sessions.revoke({ userId: user.id }, now);
}

/** Let someone back in with their old password (US-ACCT-15). */
export function enableUser(db: HlabsDb, userId: string, who: Who, now = Date.now()) {
  const user = userRow(db, userId);
  if (user.disabledAt === null) return;
  db.transaction((tx) => {
    tx.update(users).set({ disabledAt: null }).where(eq(users.id, user.id)).run();
    audit(tx, who, 'users.enable', user.id, null, now);
  });
}

/**
 * Delete someone (US-ACCT-16): their sessions end, then the account goes with its two-factor, recovery codes, app
 * access and Home layout (foreign keys cascade) and their two-factor secret leaves the secret store. Their Home
 * folder stays at `users/<username>/` unless asked; then it goes to the trash as a job. Never the last enabled admin.
 */
export async function deleteUser(
  deps: { db: HlabsDb; sessions: SessionService; secrets: SecretStore; jobs: JobRunner },
  input: { userId: string; deleteHomeFolder: boolean },
  who: Who,
  now = Date.now(),
): Promise<{ jobId: string | null }> {
  const { db } = deps;
  const user = userRow(db, input.userId);
  if (user.role === 'admin' && user.disabledAt === null && !db.transaction((tx) => anotherEnabledAdmin(tx, user.id))) {
    throw hlabsError('LAST_ADMIN');
  }
  const homePath = homeFolderPath(db, user.username);
  deps.sessions.revoke({ userId: user.id }, now);
  db.transaction((tx) => {
    if (user.role === 'admin' && user.disabledAt === null && !anotherEnabledAdmin(tx, user.id))
      throw hlabsError('LAST_ADMIN');
    tx.delete(users).where(eq(users.id, user.id)).run();
    audit(tx, who, 'users.delete', user.id, { username: user.username, deleteHomeFolder: input.deleteHomeFolder }, now);
  });
  await deps.secrets.delete(totpSecretRef(user.id)).catch(() => undefined);
  if (!input.deleteHomeFolder || !homePath) return { jobId: null };
  return {
    jobId: deps.jobs.start('home_folder_trash', {
      target: user.username,
      payload: { path: homePath, username: user.username, ownerUserId: who.userId },
    }),
  };
}
