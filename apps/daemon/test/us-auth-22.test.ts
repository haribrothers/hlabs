// US-AUTH-22 · Set a new password from an admin's reset link (server side): a valid link saves the password, ends the
// other sessions and signs in on this device; with two-factor on they log in instead (D-114).
import { userTotp } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setup() {
  const d = await daemonWithAdmin(closers);
  const anu = await memberSession(d);
  const r = (await d.mutate('users.resetPasswordLink', { userId: anu.userId })).result!.data as { url: string };
  const token = r.url.split('/reset/')[1]!;
  const reset = (newPassword = 'a brand new long passphrase') =>
    fetch(`${d.url}/trpc/auth.resetPassword`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
  return { d, anu, reset };
}

describe('US-AUTH-22', () => {
  it('signs in on this device with a session cookie and says who', async () => {
    const { d, reset } = await setup();
    const res = await reset();
    expect(((await res.json()) as { result: { data: unknown } }).result.data).toEqual({
      loggedIn: true,
      username: 'anu',
    });
    const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
    const me = await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie } });
    expect(((await me.json()) as { result: { data: { username: string } } }).result.data.username).toBe('anu');
  });

  it("with two-factor on doesn't sign in: they log in with the new password and their code", async () => {
    const { d, anu, reset } = await setup();
    d.services!.db.insert(userTotp)
      .values({ userId: anu.userId, secretRef: `totp:${anu.userId}`, enabledAt: 1 })
      .run();
    const res = await reset();
    expect(((await res.json()) as { result: { data: unknown } }).result.data).toEqual({
      loggedIn: false,
      username: 'anu',
    });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('refuses a request from another site', async () => {
    const { reset, d } = await setup();
    const res = await fetch(`${d.url}/trpc/auth.resetPassword`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ token: 'x', newPassword: 'a brand new long passphrase' }),
    });
    expect(((await res.json()) as { error: { data: { hlabsCode: string } } }).error.data.hlabsCode).toBe(
      'CSRF_REJECTED',
    );
    void reset;
  });
});
