// The first admin account (US-ONB-08, US-ONB-10): created at most once, in one transaction with its audit entry
// and the next onboarding step.
import { hlabsError } from '@hlabs/api';
import { auditLog, getSetting, setSetting, users, type HlabsDb } from '@hlabs/db';
import { enabledOnboardingSteps, nextOnboardingStep, passwordIssue, ulid, USERNAME_PATTERN } from '@hlabs/shared';
import { count } from 'drizzle-orm';
import { hashPassword } from '../auth/passwords';

export interface CreateAdminInput {
  username: string;
  displayName: string;
  password: string;
  ip: string | null;
}

export async function createAdmin(db: HlabsDb, input: CreateAdminInput, now = Date.now()): Promise<string> {
  const saved = getSetting(db, 'onboarding').step;
  const steps = enabledOnboardingSteps() as string[];
  if (steps.indexOf(saved) < steps.indexOf('account')) throw hlabsError('ONBOARDING_STEP_INVALID');

  const username = input.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw hlabsError('USERNAME_INVALID');
  const issue = passwordIssue(input.password);
  if (issue === 'tooShort') throw hlabsError('PASSWORD_TOO_SHORT');
  if (issue === 'tooCommon') throw hlabsError('PASSWORD_TOO_COMMON');

  // Hash first (slow, async); the check and the insert then run in one synchronous transaction, so two
  // requests at once can't both create an admin.
  const passwordHash = await hashPassword(input.password);
  const userId = ulid();
  db.transaction((tx) => {
    const existing = tx.select({ n: count() }).from(users).get()?.n ?? 0;
    if (existing > 0) throw hlabsError('ONBOARDING_USERS_EXIST');
    tx.insert(users)
      .values({
        id: userId,
        username,
        displayName: input.displayName.trim(),
        role: 'admin',
        passwordHash,
        createdAt: now,
        passwordChangedAt: now,
      })
      .run();
    tx.insert(auditLog)
      .values({
        id: ulid(),
        at: now,
        userId,
        action: 'user.create',
        target: userId,
        detailJson: { username, role: 'admin', via: 'onboarding' },
        ip: input.ip,
      })
      .run();
    // The settings helpers take the database; the transaction has the same query API.
    const inTx = tx as unknown as HlabsDb;
    setSetting(inTx, 'onboarding', {
      ...getSetting(inTx, 'onboarding'),
      step: nextOnboardingStep('account'),
    });
  });
  return userId;
}
