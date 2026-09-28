// US-AUTH-09 · Log in with a recovery code (server side).
import { auditLog, loginAttempts, notifications, recoveryCodes } from '@hlabs/db';
import { eq, isNotNull } from 'drizzle-orm';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { normaliseRecoveryCode } from '../src/auth/login';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function withRecoveryCodes() {
  const d = await daemonWithAdmin(closers);
  const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
  const codes = (
    (await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) })).result!.data as {
      recoveryCodes: string[];
    }
  ).recoveryCodes;
  const post = async (path: string, input: unknown) => {
    const res = await fetch(`${d.url}/trpc/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { res, body: (await res.json()) as Reply };
  };
  const challenge = async (next?: string) =>
    (await post('auth.login', { username: 'hari', password: 'correct horse battery', next })).body.result!.data
      .challengeId as string;
  const recover = async (code: string, next?: string) =>
    post('auth.useRecoveryCode', { challengeId: await challenge(next), code });
  return { ...d, codes, recover };
}

describe('US-AUTH-09', () => {
  it('normalises codes typed with or without the dash, in any case', () => {
    expect(normaliseRecoveryCode('ABCD-2345')).toBe('abcd-2345');
    expect(normaliseRecoveryCode(' abcd2345 ')).toBe('abcd-2345');
    expect(normaliseRecoveryCode('ab cd 23 45')).toBe('abcd-2345');
    expect(normaliseRecoveryCode('abcd-234')).toBeNull();
  });

  it('an unused code logs in, is used up, is audited and notifies the user', async () => {
    const d = await withRecoveryCodes();
    const { res, body } = await d.recover(d.codes[3]!.toUpperCase().replace('-', ''), '/files');
    expect(body.result?.data).toEqual({ redirectTo: '/files', recoveryCodesLeft: 9 });
    expect(res.headers.get('set-cookie')).toMatch(/^hlabs_session=/);
    const db = d.services!.db;
    expect(db.select().from(recoveryCodes).where(isNotNull(recoveryCodes.usedAt)).all()).toHaveLength(1);
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'auth.login.recovery_code')).all()).toHaveLength(1);
    const [note] = db.select().from(notifications).all();
    expect(note).toMatchObject({ userId: d.userId, severity: 'warning', title: 'Recovery code used' });
  });

  it('a used or wrong code is refused and counts toward the lockout', async () => {
    const d = await withRecoveryCodes();
    expect((await d.recover(d.codes[0]!)).body.result?.data.recoveryCodesLeft).toBe(9);
    expect((await d.recover(d.codes[0]!)).body.error?.data.hlabsCode).toBe('AUTH_RECOVERY_INVALID');
    expect((await d.recover('zzzz-zzzz')).body.error?.data.hlabsCode).toBe('AUTH_RECOVERY_INVALID');
    const failed = d.services!.db.select().from(loginAttempts).where(eq(loginAttempts.success, false)).all();
    expect(failed).toHaveLength(2);
  });

  it('two tabs using the same code at once: only one gets in', async () => {
    const d = await withRecoveryCodes();
    const results = await Promise.all([d.recover(d.codes[5]!), d.recover(d.codes[5]!)]);
    expect(results.filter((r) => r.body.result).length).toBe(1);
    expect(results.filter((r) => r.body.error?.data.hlabsCode === 'AUTH_RECOVERY_INVALID').length).toBe(1);
  });
});
