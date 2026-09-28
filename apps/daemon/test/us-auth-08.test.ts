// US-AUTH-08 · Enter my two-factor code (server side).
import { loginAttempts, sessions } from '@hlabs/db';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { CHALLENGE_MS } from '../src/auth/login';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function withTwoFactor() {
  const d = await daemonWithAdmin(closers);
  const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
  await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) });
  const post = async (path: string, input: unknown) => {
    const res = await fetch(`${d.url}/trpc/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { res, body: (await res.json()) as Reply };
  };
  const password = async (next?: string) =>
    (await post('auth.login', { username: 'hari', password: 'correct horse battery', next })).body.result!.data
      .challengeId as string;
  const verify = (challengeId: string, code: string) => post('auth.verifyTotp', { challengeId, code });
  // A code from the step after the one onboarding used, so it isn't a replay.
  const codeLater = (steps = 1) => generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 * steps });
  return { ...d, secret, password, verify, codeLater };
}

describe('US-AUTH-08', () => {
  it('the right code starts the session and goes to next', async () => {
    const d = await withTwoFactor();
    const challenge = await d.password('/files');
    const { res, body } = await d.verify(challenge, d.codeLater());
    expect(body.result?.data).toEqual({ redirectTo: '/files' });
    expect(res.headers.get('set-cookie')).toMatch(/^hlabs_session=/);
    // The challenge is used up.
    expect((await d.verify(challenge, d.codeLater())).body.error?.data.hlabsCode).toBe('AUTH_CHALLENGE_EXPIRED');
  });

  it('a wrong code is refused and counts toward the lockout', async () => {
    const d = await withTwoFactor();
    const challenge = await d.password();
    const wrong = d.codeLater() === '000000' ? '111111' : '000000';
    expect((await d.verify(challenge, wrong)).body.error?.data.hlabsCode).toBe('AUTH_TOTP_INVALID');
    expect(
      d
        .services!.db.select()
        .from(loginAttempts)
        .all()
        .filter((a) => !a.success),
    ).toHaveLength(1);
    for (let i = 0; i < 3; i++) await d.verify(challenge, wrong);
    expect((await d.verify(challenge, wrong)).body.error?.data.hlabsCode).toBe('AUTH_LOCKED');
  });

  it('a code already accepted in the same step is refused (no replay)', async () => {
    const d = await withTwoFactor();
    const code = d.codeLater();
    expect((await d.verify(await d.password(), code)).body.result).toBeDefined();
    expect((await d.verify(await d.password(), code)).body.error?.data.hlabsCode).toBe('AUTH_TOTP_INVALID');
  });

  it('a challenge older than 5 minutes has expired', async () => {
    const d = await withTwoFactor();
    const before = d.services!.db.select().from(sessions).all().length;
    const result = await d.services!.login.login({
      username: 'hari',
      password: 'correct horse battery',
      remember: false,
      ip: '127.0.0.1',
      userAgent: null,
      now: Date.now() - CHALLENGE_MS - 1000,
    });
    if (result.kind !== 'totp') throw new Error('expected a challenge');
    expect((await d.verify(result.challengeId, d.codeLater())).body.error?.data.hlabsCode).toBe(
      'AUTH_CHALLENGE_EXPIRED',
    );
    expect(d.services!.db.select().from(sessions).all()).toHaveLength(before);
  });
});
