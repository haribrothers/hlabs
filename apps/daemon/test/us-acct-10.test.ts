// US-ACCT-10 · Make new recovery codes (server side).
import { auditLog, recoveryCodes } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withTwoFactor() {
  const d = await daemonWithAdmin(closers);
  const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
  const old = (
    (await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) })).result!.data as {
      recoveryCodes: string[];
    }
  ).recoveryCodes;
  const recoverWith = async (code: string) => {
    const r = await d.services!.login.login({
      username: 'hari',
      password: 'correct horse battery',
      remember: false,
      ip: '10.1.1.1',
      userAgent: null,
    });
    if (r.kind !== 'totp') throw new Error('expected a challenge');
    return d.services!.login.useRecoveryCode({ challengeId: r.challengeId, code, ip: '10.1.1.1', userAgent: null });
  };
  return { ...d, old, recoverWith };
}

describe('US-ACCT-10', () => {
  it('the right password replaces all codes at once: old ones stop working, the new ones work', async () => {
    const d = await withTwoFactor();
    const r = await d.mutate('account.recoveryCodes.regenerate', { password: 'correct horse battery' });
    const fresh = (r.result!.data as { recoveryCodes: string[] }).recoveryCodes;
    expect(fresh).toHaveLength(10);
    expect(fresh.every((c) => /^[a-z0-9]{4}-[a-z0-9]{4}$/.test(c))).toBe(true);
    expect(d.services!.db.select().from(recoveryCodes).all()).toHaveLength(10);
    expect(((await d.query('account.get')).result!.data as { recoveryCodesUnused: number }).recoveryCodesUnused).toBe(
      10,
    );
    expect(
      d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'account.recoveryCodes.regenerate')).all(),
    ).toHaveLength(1);

    await expect(d.recoverWith(d.old[0]!)).rejects.toMatchObject({ cause: { hlabsCode: 'AUTH_RECOVERY_INVALID' } });
    await expect(d.recoverWith(fresh[0]!)).resolves.toMatchObject({ recoveryCodesLeft: 9 });
  });

  it('a wrong password is refused and the old codes still work', async () => {
    const d = await withTwoFactor();
    const r = await d.mutate('account.recoveryCodes.regenerate', { password: 'not it' });
    expect(r.error?.data.hlabsCode).toBe('AUTH_INVALID_PASSWORD');
    await expect(d.recoverWith(d.old[1]!)).resolves.toMatchObject({ recoveryCodesLeft: 9 });
  });
});
