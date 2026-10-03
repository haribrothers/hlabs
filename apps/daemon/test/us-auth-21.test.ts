// US-AUTH-21 · Recovery codes never reset a password (D-009): auth.resetPassword takes only { token, newPassword } and
// only a live admin reset link; anything else, a recovery code included, is AUTH_RESET_EXPIRED and changes nothing.
// (ForgotPassword offering no recovery-code form is tested in apps/web, us-auth-20.)
import { auditLog, passwordResets, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { trayResetPassword } from '../src/tray/reset-password';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: unknown; error?: { data: { hlabsCode: string } } };

async function withRecoveryCodes() {
  const d = await daemonWithAdmin(closers);
  const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
  const codes = (
    (await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) })).result!.data as {
      recoveryCodes: string[];
    }
  ).recoveryCodes;
  const reset = async (input: unknown) => {
    const res = await fetch(`${d.url}/trpc/auth.resetPassword`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return (await res.json()) as Reply;
  };
  const hash = () => d.services!.db.select().from(users).where(eq(users.id, d.userId)).get()!.passwordHash;
  return { d, codes, reset, hash };
}

describe('US-AUTH-21', () => {
  it('a recovery code as the token is AUTH_RESET_EXPIRED and changes nothing', async () => {
    const { d, codes, reset, hash } = await withRecoveryCodes();
    const before = hash();
    const audits = d.services!.db.select().from(auditLog).all().length;
    for (const token of [codes[0]!, codes[0]!.replace('-', ''), 'not-a-real-token']) {
      expect((await reset({ token, newPassword: 'a brand new long passphrase' })).error?.data.hlabsCode).toBe(
        'AUTH_RESET_EXPIRED',
      );
    }
    expect(hash()).toBe(before);
    expect(d.services!.db.select().from(auditLog).all()).toHaveLength(audits);
  });

  it('only { token, newPassword }: a username with a recovery code is refused before anything is looked up', async () => {
    const { codes, reset, hash } = await withRecoveryCodes();
    const before = hash();
    const res = await reset({ username: 'hari', recoveryCode: codes[1], newPassword: 'a brand new long passphrase' });
    expect(res.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect(hash()).toBe(before);
  });

  it("a tray reset's record isn't a link: it can't be used through auth.resetPassword", async () => {
    const { d, reset } = await withRecoveryCodes();
    await trayResetPassword(d.services!, {
      username: 'hari',
      newPassword: 'violet harbour lantern',
      disableTotp: false,
    });
    const row = d.services!.db.select().from(passwordResets).get()!;
    expect(row.tokenHash).toBeNull();
    expect((await reset({ token: '', newPassword: 'another long passphrase' })).error?.data.hlabsCode).toBe(
      'VALIDATION_FAILED',
    );
    expect((await reset({ token: 'null', newPassword: 'another long passphrase' })).error?.data.hlabsCode).toBe(
      'AUTH_RESET_EXPIRED',
    );
  });

  it('a recovery code still replaces only the two-factor step (US-AUTH-09)', async () => {
    const { d, codes } = await withRecoveryCodes();
    const login = await fetch(`${d.url}/trpc/auth.login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'hari', password: 'correct horse battery' }),
    });
    const challengeId = ((await login.json()) as { result: { data: { challengeId: string } } }).result.data.challengeId;
    const used = await fetch(`${d.url}/trpc/auth.useRecoveryCode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeId, code: codes[2] }),
    });
    expect(used.status).toBe(200);
  });
});
