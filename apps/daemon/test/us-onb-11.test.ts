// US-ONB-11 · Turn on two-factor login (server side).
import { auditLog, getSetting, recoveryCodes, userTotp } from '@hlabs/db';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { totpSecretRef, verifyTotpCode } from '../src/auth/totp';
import { FileSecretStore } from '../src/platform/secrets';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const codeFor = (secret: string, now = Date.now()) => generateSync({ secret, epoch: Math.floor(now / 1000) });

describe('US-ONB-11', () => {
  it('sets up a TOTP secret with an otpauth URL for issuer hlabs and the username', async () => {
    const d = await daemonWithAdmin(closers);
    const setup = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string; otpauthUrl: string };
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
    const url = new URL(setup.otpauthUrl);
    expect(url.protocol).toBe('otpauth:');
    expect(decodeURIComponent(url.pathname)).toContain('hlabs:hari');
    expect(url.searchParams.get('secret')).toBe(setup.secret);
    expect(url.searchParams.get('issuer')).toBe('hlabs');
  });

  it('a wrong code is refused; the right one turns two-factor on and returns 10 recovery codes', async () => {
    const d = await daemonWithAdmin(closers);
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    const wrong = codeFor(secret) === '000000' ? '111111' : '000000';
    expect((await d.mutate('onboarding.confirmTotp', { code: wrong })).error?.data.hlabsCode).toBe('TOTP_INVALID_CODE');

    const ok = (await d.mutate('onboarding.confirmTotp', { code: codeFor(secret) })).result!.data as {
      recoveryCodes: string[];
    };
    expect(ok.recoveryCodes).toHaveLength(10);
    for (const c of ok.recoveryCodes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(new Set(ok.recoveryCodes).size).toBe(10);

    const db = d.services!.db;
    expect(db.select().from(userTotp).get()).toMatchObject({ userId: d.userId, secretRef: totpSecretRef(d.userId) });
    expect(db.select().from(userTotp).get()!.enabledAt).toBeGreaterThan(0);
    expect(await new FileSecretStore(d.config.paths.dataDir).get(totpSecretRef(d.userId))).toBe(secret);
    const hashes = db.select().from(recoveryCodes).all();
    expect(hashes).toHaveLength(10);
    for (const h of hashes) expect(h.codeHash).toMatch(/^\$argon2id\$/);
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .map((a) => a.action),
    ).toContain('totp.enable');
    // Continue on the recovery codes view moves on (US-ONB-12); until then the step stays.
    expect(getSetting(db, 'onboarding').step).toBe('twoFactor');
  });

  it('a new setup (reload) replaces the pending secret, so the first one stops working', async () => {
    const d = await daemonWithAdmin(closers);
    const first = (await d.mutate('onboarding.setupTotp')).result!.data.secret as string;
    const second = (await d.mutate('onboarding.setupTotp')).result!.data.secret as string;
    expect(second).not.toBe(first);
    if (codeFor(first) !== codeFor(second)) {
      expect((await d.mutate('onboarding.confirmTotp', { code: codeFor(first) })).error?.data.hlabsCode).toBe(
        'TOTP_INVALID_CODE',
      );
    }
    expect((await d.mutate('onboarding.confirmTotp', { code: codeFor(second) })).result).toBeDefined();
    // Once on, setup can't start again here.
    expect((await d.mutate('onboarding.setupTotp')).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
  });

  it('5 wrong codes in 15 minutes lock confirmation', async () => {
    const d = await daemonWithAdmin(closers);
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    const right = codeFor(secret);
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await d.mutate('onboarding.confirmTotp', { code: wrong });
    const locked = await d.mutate('onboarding.confirmTotp', { code: right });
    expect(locked.error?.data.hlabsCode).toBe('AUTH_LOCKED');
  });

  it('needs the admin session, not the setup token', async () => {
    const d = await daemonWithAdmin(closers);
    const res = await fetch(`${d.url}/trpc/onboarding.setupTotp?batch=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hlabs-setup': d.token },
      body: '{}',
    });
    expect(((await res.json()) as Array<{ error: { data: { hlabsCode: string } } }>)[0]!.error.data.hlabsCode).toBe(
      'AUTH_REQUIRED',
    );
  });
});

describe('US-ONB-11 codes (RFC 6238)', () => {
  it('accepts the current step and one step either side, nothing further', () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    const now = 1_790_000_000_000;
    expect(verifyTotpCode(secret, codeFor(secret, now), now)).toBe(true);
    expect(verifyTotpCode(secret, codeFor(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotpCode(secret, codeFor(secret, now + 30_000), now)).toBe(true);
    expect(verifyTotpCode(secret, codeFor(secret, now - 90_000), now)).toBe(false);
    expect(verifyTotpCode(secret, '12345', now)).toBe(false);
  });
});
