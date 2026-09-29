// US-ACCT-11 · Move two-factor to a new phone (server side).
import { auditLog, recoveryCodes } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { PENDING_MS } from '../src/auth/totp';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const later = (secret: string, steps = 1) =>
  generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 * steps });

async function withTwoFactor() {
  const d = await daemonWithAdmin(closers);
  const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
  await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) });
  return { ...d, oldSecret: secret };
}

describe('US-ACCT-11', () => {
  it('password, then a new secret; the right code swaps it, keeps the recovery codes, and the old app stops working', async () => {
    const d = await withTwoFactor();
    const codesBefore = d
      .services!.db.select()
      .from(recoveryCodes)
      .all()
      .map((c) => c.id);
    const begun = (await d.mutate('account.totp.begin', { password: 'correct horse battery' })).result!.data as {
      secret: string;
      otpauthUrl: string;
    };
    expect(begun.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(begun.secret).not.toBe(d.oldSecret);

    const r = await d.mutate('account.totp.confirm', { code: generateSync({ secret: begun.secret }) });
    expect(r.result?.data).toEqual({ recoveryCodes: [] });
    expect(
      d
        .services!.db.select()
        .from(recoveryCodes)
        .all()
        .map((c) => c.id),
    ).toEqual(codesBefore);
    expect(d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'totp.move')).all()).toHaveLength(1);
    expect(await d.services!.totp.verifyLogin(d.userId, later(d.oldSecret))).toBe(false);
    expect(await d.services!.totp.verifyLogin(d.userId, later(begun.secret))).toBe(true);
  });

  it('a wrong code changes nothing: the old app still works', async () => {
    const d = await withTwoFactor();
    await d.mutate('account.totp.begin', { password: 'correct horse battery' });
    expect((await d.mutate('account.totp.confirm', { code: '000000' })).error?.data.hlabsCode).toBe(
      'TOTP_INVALID_CODE',
    );
    expect(await d.services!.totp.verifyLogin(d.userId, later(d.oldSecret))).toBe(true);
  });

  it('a wrong password is refused; a pending secret expires after 10 minutes', async () => {
    const d = await withTwoFactor();
    expect((await d.mutate('account.totp.begin', { password: 'wrong' })).error?.data.hlabsCode).toBe(
      'AUTH_INVALID_PASSWORD',
    );
    const { secret } = d.services!.totp.begin(d.userId, { move: true, now: Date.now() - PENDING_MS - 1000 });
    await expect(d.services!.totp.confirm(d.userId, generateSync({ secret }), { ip: null })).rejects.toMatchObject({
      cause: { hlabsCode: 'VALIDATION_FAILED' },
    });
  });
});
