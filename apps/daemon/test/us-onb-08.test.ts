// US-ONB-08 · Create the admin account (server side).
import { auditLog, getSetting, users } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function atAccountStep() {
  const printed: string[] = [];
  const d = await startDaemon({ config: { devAnonymousAdmin: false }, boot: { print: (l) => printed.push(l) } });
  closers.push(d.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  const reset = (step: string) =>
    fetch(`${d.url}/dev/reset-onboarding`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step }),
    });
  await reset('account');
  const create = async (input: Record<string, unknown>) => {
    const res = await fetch(`${d.url}/trpc/onboarding.createAdmin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hlabs-setup': token },
      body: JSON.stringify(input),
    });
    return { res, body: (await res.json()) as Reply };
  };
  return { ...d, token, create, reset };
}

const valid = { displayName: '  Hari Prasad ', username: 'Hari', password: 'correct horse battery' };

describe('US-ONB-08', () => {
  it('creates the admin, signs them in with a session cookie and moves on to two-factor', async () => {
    const d = await atAccountStep();
    const { res, body } = await d.create(valid);
    const userId = body.result?.data.userId as string;
    expect(userId).toBeTruthy();

    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^hlabs_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax$/);

    const db = d.services!.db;
    const user = db.select().from(users).get()!;
    expect(user).toMatchObject({ id: userId, username: 'hari', displayName: 'Hari Prasad', role: 'admin' });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(db.select().from(auditLog).all()).toEqual([
      expect.objectContaining({ userId, action: 'user.create', target: userId }),
    ]);
    expect(getSetting(db, 'onboarding').step).toBe('twoFactor');

    const raw = cookie.split(';')[0]!;
    const me = (await (await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie: raw } })).json()) as Reply;
    expect(me.result?.data).toMatchObject({ id: userId, username: 'hari', role: 'admin' });

    // The setup token has done its job: from now on the admin's session is needed.
    const again = await fetch(`${d.url}/trpc/onboarding.setStep`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hlabs-setup': d.token },
      body: JSON.stringify({ step: 'storage' }),
    });
    expect(((await again.json()) as Reply).error?.data.hlabsCode).toBe('AUTH_REQUIRED');
  });

  it('checks the username and password rules on the server', async () => {
    const d = await atAccountStep();
    expect((await d.create({ ...valid, username: 'h' })).body.error?.data.hlabsCode).toBe('USERNAME_INVALID');
    expect((await d.create({ ...valid, username: 'hari_p' })).body.error?.data.hlabsCode).toBe('USERNAME_INVALID');
    expect((await d.create({ ...valid, password: 'short' })).body.error?.data.hlabsCode).toBe('PASSWORD_TOO_SHORT');
    expect((await d.create({ ...valid, password: 'Q1W2E3R4T5Y6' })).body.error?.data.hlabsCode).toBe(
      'PASSWORD_TOO_COMMON',
    );
    expect((await d.create({ ...valid, displayName: '   ' })).body.error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    expect(d.services!.db.select().from(users).all()).toEqual([]);
  });

  it('is only possible from the account step', async () => {
    const d = await atAccountStep();
    await d.reset('system');
    expect((await d.create(valid)).body.error?.data.hlabsCode).toBe('ONBOARDING_STEP_INVALID');
  });
});
