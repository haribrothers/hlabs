// US-AUTH-11 · Keep two-factor codes in step with the server clock.
import { auditLog, loginAttempts } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { generateSecret, generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { totpCodeStep, totpSecretRef } from '../src/auth/totp';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-AUTH-11', () => {
  // A fixed clock in the middle of a 30-second step.
  const now = Date.UTC(2026, 8, 28, 12, 0, 15);
  const secret = generateSecret();
  const codeAt = (steps: number) => generateSync({ secret, epoch: Math.floor(now / 1000) + 30 * steps });

  it('accepts codes from the previous, current and next step', () => {
    for (const steps of [-1, 0, 1]) expect(totpCodeStep(secret, codeAt(steps), { now })).not.toBeNull();
  });

  it('rejects codes two or more steps away', () => {
    for (const steps of [-3, -2, 2, 3]) {
      const code = codeAt(steps);
      // Skip the rare collision with a code inside the window.
      if ([-1, 0, 1].some((s) => codeAt(s) === code)) continue;
      expect(totpCodeStep(secret, code, { now })).toBeNull();
    }
  });

  it("an unreadable secret says so, is logged, and doesn't count toward the lockout", async () => {
    const d = await daemonWithAdmin(closers);
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) });
    await d.services!.secrets.delete(totpSecretRef(d.userId));

    const post = async (path: string, input: unknown) =>
      (await (
        await fetch(`${d.url}/trpc/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).json()) as { result?: { data: { challengeId: string } }; error?: { data: { hlabsCode: string } } };
    const { challengeId } = (await post('auth.login', { username: 'hari', password: 'correct horse battery' })).result!
      .data;
    const reply = await post('auth.verifyTotp', { challengeId, code: '123456' });
    expect(reply.error?.data.hlabsCode).toBe('AUTH_SECRET_UNAVAILABLE');
    const db = d.services!.db;
    expect(db.select().from(loginAttempts).where(eq(loginAttempts.success, false)).all()).toHaveLength(0);
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'auth.totp.secret_unavailable')).all()).toHaveLength(1);
  });
});
