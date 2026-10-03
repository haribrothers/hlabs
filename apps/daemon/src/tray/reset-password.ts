// The tray's password reset (US-INST-18). The tray asks the Mac's login (Touch ID or the account password) first, so
// whoever gets here can log in to the computer running hlabs (07 §7.2, D-009). It sets the new password, signs the
// person out everywhere, clears their log-in lockouts and, if asked, turns their two-factor off; it's recorded in
// password_resets (created_via tray, used at once) and the audit log.
import { hlabsError } from '@hlabs/api';
import { auditLog, loginAttempts, passwordResets, users, type HlabsDb } from '@hlabs/db';
import { passwordIssue, ulid } from '@hlabs/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { hashPassword } from '../auth/passwords';
import type { SessionService } from '../auth/sessions';
import type { TotpService } from '../auth/totp';

export async function trayResetPassword(
  deps: { db: HlabsDb; sessions: SessionService; totp: TotpService },
  input: { username: string; newPassword: string; disableTotp: boolean },
  now = Date.now(),
): Promise<void> {
  const { db } = deps;
  const issue = passwordIssue(input.newPassword);
  if (issue === 'tooShort') throw hlabsError('PASSWORD_TOO_SHORT');
  if (issue === 'tooCommon') throw hlabsError('PASSWORD_TOO_COMMON');
  // Deleted or disabled since the window opened: "This account no longer exists".
  const user = db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(and(eq(users.username, input.username), isNull(users.disabledAt)))
    .get();
  if (!user) throw hlabsError('NOT_FOUND');
  const totpDisabled = input.disableTotp && deps.totp.isEnabled(user.id);
  const passwordHash = await hashPassword(input.newPassword);
  db.transaction((tx) => {
    tx.update(users).set({ passwordHash, passwordChangedAt: now }).where(eq(users.id, user.id)).run();
    // Their lockouts end with the new password.
    tx.delete(loginAttempts).where(eq(loginAttempts.username, user.username)).run();
    tx.insert(passwordResets)
      .values({ id: ulid(), userId: user.id, tokenHash: null, createdVia: 'tray', expiresAt: now, usedAt: now })
      .run();
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId: null,
        action: 'user.passwordReset',
        target: user.id,
        detailJson: { via: 'tray', totpDisabled },
        ip: null,
      })
      .run();
  });
  if (totpDisabled) await deps.totp.remove(user.id);
  deps.sessions.revoke({ userId: user.id }, now);
}
