// Reset-password links (US-ACCT-14): there's no email, so an admin makes a one-time link for a member and gives it to
// them. It works once, for 15 minutes; making a new one stops the earlier one. Using it (auth.resetPassword, the page
// is US-AUTH-22) sets the new password and signs the person out everywhere.
import { hlabsError } from '@hlabs/api';
import { auditLog, passwordResets, users, type HlabsDb } from '@hlabs/db';
import { passwordIssue, ulid } from '@hlabs/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/passwords';
import type { SessionService } from '../auth/sessions';
import { lanDashboardOrigin } from '../http/dashboard-origins';
import { linkOrigins } from '../network/domains';

export const RESET_LINK_TTL_MS = 15 * 60_000;

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createResetLink(
  db: HlabsDb,
  userId: string,
  who: { userId: string; ip: string | null },
  now = Date.now(),
) {
  if (!db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()) throw hlabsError('NOT_FOUND');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + RESET_LINK_TTL_MS;
  db.transaction((tx) => {
    // The earlier unused link stops working.
    tx.update(passwordResets)
      .set({ usedAt: now })
      .where(
        and(eq(passwordResets.userId, userId), eq(passwordResets.createdVia, 'admin'), isNull(passwordResets.usedAt)),
      )
      .run();
    tx.insert(passwordResets)
      .values({ id: ulid(), userId, tokenHash: tokenHash(token), createdVia: 'admin', expiresAt })
      .run();
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId: who.userId,
        action: 'users.resetPasswordLink',
        target: userId,
        detailJson: null,
        ip: who.ip,
      })
      .run();
  });
  const { primary, home } = linkOrigins(db, lanDashboardOrigin(db));
  return { url: `${primary}/reset/${token}`, homeUrl: home ? `${home}/reset/${token}` : null, expiresAt };
}

/** Uses a link once: a link that's unknown, used, replaced or older than 15 minutes is AUTH_RESET_EXPIRED. */
export async function resetPassword(
  deps: { db: HlabsDb; sessions: SessionService },
  input: { token: string; newPassword: string },
  ip: string | null,
  now = Date.now(),
) {
  const { db } = deps;
  const hash = tokenHash(input.token);
  const live = and(
    eq(passwordResets.tokenHash, hash),
    eq(passwordResets.createdVia, 'admin'),
    isNull(passwordResets.usedAt),
    gt(passwordResets.expiresAt, now),
  );
  if (!db.select({ id: passwordResets.id }).from(passwordResets).where(live).get())
    throw hlabsError('AUTH_RESET_EXPIRED');
  const issue = passwordIssue(input.newPassword);
  if (issue === 'tooShort') throw hlabsError('PASSWORD_TOO_SHORT');
  if (issue === 'tooCommon') throw hlabsError('PASSWORD_TOO_COMMON');
  const passwordHash = await hashPassword(input.newPassword);
  const userId = db.transaction((tx) => {
    const used = tx.update(passwordResets).set({ usedAt: now }).where(live).returning().get();
    if (!used) throw hlabsError('AUTH_RESET_EXPIRED');
    tx.update(users).set({ passwordHash, passwordChangedAt: now }).where(eq(users.id, used.userId)).run();
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId: used.userId,
        action: 'auth.resetPassword',
        target: used.userId,
        detailJson: { via: 'admin' },
        ip,
      })
      .run();
    return used.userId;
  });
  deps.sessions.revoke({ userId }, now);
  return { userId };
}
