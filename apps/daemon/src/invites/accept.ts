// Accepting an invite (US-AUTH-24): the new account, its apps and Home folder, all from one use of the link.
import { hlabsError } from '@hlabs/api';
import {
  appAccess,
  apps,
  auditLog,
  inviteAppAccess,
  invites,
  loginAttempts,
  storageLocations,
  users,
  type HlabsDb,
} from '@hlabs/db';
import { passwordIssue, ulid, USERNAME_PATTERN } from '@hlabs/shared';
import { and, asc, eq, gt, gte, isNull } from 'drizzle-orm';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { LOGIN_LOCK_MS, lockState } from '../auth/login';
import { hashPassword } from '../auth/passwords';
import type { Logger } from '../logger';
import type { NotificationService } from '../notifications/service';
import type { SecretStore } from '../platform/secrets';
import { inviteTokenHash } from './invites';

/**
 * Failed accepts (a link that doesn't work) are recorded as log-in attempts under this name, which no username can
 * be, so token guessing pauses like logins do: 5 in 15 minutes from one IP (US-AUTH-24, US-AUTH-12).
 */
export const INVITE_ATTEMPT_NAME = '#invite';

export interface AcceptInput {
  token: string;
  displayName: string;
  username: string;
  password: string;
}

function checkLock(db: HlabsDb, ip: string, now: number) {
  const attempts = db
    .select({ at: loginAttempts.at, success: loginAttempts.success })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, INVITE_ATTEMPT_NAME),
        eq(loginAttempts.ip, ip),
        gte(loginAttempts.at, now - 2 * LOGIN_LOCK_MS),
      ),
    )
    .orderBy(asc(loginAttempts.at))
    .all();
  const { lockedUntil } = lockState(attempts, now);
  if (lockedUntil !== null && lockedUntil > now) {
    throw hlabsError('AUTH_LOCKED', 'Too many invite attempts', { until: lockedUntil });
  }
}

const recordFailure = (db: HlabsDb, ip: string, now: number) =>
  db.insert(loginAttempts).values({ id: ulid(), username: INVITE_ATTEMPT_NAME, ip, at: now, success: false }).run();

/**
 * Creates the account in one transaction: the invite is marked used only if it still works (so two people with the
 * same link get one account), the user gets the invite's role, a member gets the invite's apps (those still
 * installed), and it's audited. The Home folder is made afterwards; the inviter hears that they joined.
 */
export async function acceptInvite(
  deps: { db: HlabsDb; secrets: SecretStore; notifications: NotificationService; logger: Logger },
  input: AcceptInput,
  ip: string,
  now = Date.now(),
): Promise<{ userId: string; role: 'admin' | 'member' }> {
  const { db } = deps;
  checkLock(db, ip, now);
  const tokenHash = inviteTokenHash(input.token);
  const live = () =>
    db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.tokenHash, tokenHash),
          isNull(invites.usedAt),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, now),
        ),
      )
      .get();
  if (!live()) {
    recordFailure(db, ip, now);
    throw hlabsError('INVITE_INVALID');
  }

  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw hlabsError('USERNAME_INVALID');
  const issue = passwordIssue(input.password);
  if (issue === 'tooShort') throw hlabsError('PASSWORD_TOO_SHORT');
  if (issue === 'tooCommon') throw hlabsError('PASSWORD_TOO_COMMON');
  const displayName = input.displayName.trim();
  if (db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
    throw hlabsError('USERNAME_TAKEN');
  }

  // Hash first (slow, async); everything else is one synchronous transaction.
  const passwordHash = await hashPassword(input.password);
  const userId = ulid();
  const invite = db.transaction((tx) => {
    const used = tx
      .update(invites)
      .set({ usedAt: now })
      .where(
        and(
          eq(invites.tokenHash, tokenHash),
          isNull(invites.usedAt),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, now),
        ),
      )
      .returning()
      .get();
    if (!used) throw hlabsError('INVITE_INVALID');
    if (tx.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
      throw hlabsError('USERNAME_TAKEN');
    }
    tx.insert(users).values({ id: userId, username, displayName, role: used.role, passwordHash, createdAt: now }).run();
    if (used.role === 'member') {
      const shared = tx
        .select({ appId: inviteAppAccess.appId })
        .from(inviteAppAccess)
        .innerJoin(apps, eq(apps.id, inviteAppAccess.appId))
        .where(eq(inviteAppAccess.inviteId, used.id))
        .all();
      if (shared.length)
        tx.insert(appAccess)
          .values(shared.map((s) => ({ appId: s.appId, userId })))
          .run();
    }
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId,
        action: 'invite.accepted',
        target: used.id,
        detailJson: { username, role: used.role, invitedBy: used.createdBy },
        ip,
      })
      .run();
    return used;
  });

  if (invite.tokenRef) await deps.secrets.delete(invite.tokenRef).catch(() => undefined);
  await makeHomeFolder(db, username).catch((err: unknown) =>
    deps.logger.warn({ err, username }, "couldn't create a Home folder for a new account"),
  );
  deps.notifications.create({
    userId: invite.createdBy,
    kind: 'user_joined',
    target: userId,
    severity: 'info',
    title: `${displayName} joined hlabs`,
    now,
  });
  return { userId, role: invite.role };
}

/** `users/<username>/` in the storage root, as onboarding makes the admin's. */
async function makeHomeFolder(db: HlabsDb, username: string) {
  const root = db
    .select({ path: storageLocations.path })
    .from(storageLocations)
    .where(eq(storageLocations.isRoot, true))
    .get();
  if (root) await mkdir(join(root.path, 'users', username), { recursive: true });
}
