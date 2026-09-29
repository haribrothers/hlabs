// US-ACCT-12 · Turn two-factor on or off (server side).
import { auditLog, recoveryCodes, setSetting, userTotp } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { totpSecretRef } from '../src/auth/totp';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const PASSWORD = 'correct horse battery';

describe('US-ACCT-12', () => {
  it('turns on from Account: password, then a code, then 10 recovery codes', async () => {
    const d = await daemonWithAdmin(closers);
    const { secret } = (await d.mutate('account.totp.begin', { password: PASSWORD })).result!.data as {
      secret: string;
    };
    const r = await d.mutate('account.totp.confirm', { code: generateSync({ secret }) });
    expect((r.result!.data as { recoveryCodes: string[] }).recoveryCodes).toHaveLength(10);
    expect(d.services!.totp.isEnabled(d.userId)).toBe(true);
  });

  async function on() {
    const d = await daemonWithAdmin(closers);
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    const codes = (
      (await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) })).result!.data as {
        recoveryCodes: string[];
      }
    ).recoveryCodes;
    const phone = d.services!.sessions.create({ userId: d.userId });
    return { ...d, secret, codes, phone };
  }

  it('turns off with the password and a current code: secret, codes and other sessions go', async () => {
    const d = await on();
    const r = await d.mutate('account.totp.disable', { password: PASSWORD, code: generateSync({ secret: d.secret }) });
    expect(r.result?.data).toEqual({ ok: true });
    const db = d.services!.db;
    expect(d.services!.totp.isEnabled(d.userId)).toBe(false);
    expect(db.select().from(userTotp).all()).toHaveLength(0);
    expect(db.select().from(recoveryCodes).all()).toHaveLength(0);
    expect(await d.services!.secrets.get(totpSecretRef(d.userId))).toBeNull();
    expect(d.services!.sessions.resolve(d.phone.raw)).toBeNull();
    expect((await d.query('auth.me')).result).toBeDefined();
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'totp.disable')).all()).toHaveLength(1);
  });

  it('a recovery code works instead of the 6-digit code', async () => {
    const d = await on();
    const r = await d.mutate('account.totp.disable', { password: PASSWORD, code: d.codes[0]!.toUpperCase() });
    expect(r.result?.data).toEqual({ ok: true });
  });

  it('a wrong code or password changes nothing; an admin rule to require it refuses', async () => {
    const d = await on();
    expect((await d.mutate('account.totp.disable', { password: PASSWORD, code: '000000' })).error?.data.hlabsCode).toBe(
      'TOTP_INVALID_CODE',
    );
    expect(
      (await d.mutate('account.totp.disable', { password: 'wrong', code: generateSync({ secret: d.secret }) })).error
        ?.data.hlabsCode,
    ).toBe('AUTH_INVALID_PASSWORD');
    setSetting(d.services!.db, 'people', {
      showUserList: true,
      membersCanInstall: false,
      membersCanSeeUsage: false,
      requireTotp: true,
    });
    expect(
      (await d.mutate('account.totp.disable', { password: PASSWORD, code: generateSync({ secret: d.secret }) })).error
        ?.data.hlabsCode,
    ).toBe('TOTP_REQUIRED_BY_ADMIN');
    expect(d.services!.totp.isEnabled(d.userId)).toBe(true);
  });
});
