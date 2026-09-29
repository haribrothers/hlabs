// US-AUTH-14 · Stay signed in, or not (server side).
import { sessions } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { cookieDomain, IDLE_MS, REMEMBER_MS } from '../src/auth/sessions';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function logIn(url: string, remember: boolean, host?: string) {
  const res = await fetch(`${url}/trpc/auth.login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(host ? { 'x-forwarded-host': host } : {}) },
    body: JSON.stringify({ username: 'hari', password: 'correct horse battery', remember }),
  });
  const setCookie = res.headers.get('set-cookie')!;
  return { setCookie, cookie: setCookie.split(';')[0]! };
}

describe('US-AUTH-14', () => {
  it('the cookie is shared with app hostnames only on the mDNS name', () => {
    expect(cookieDomain('hlabs.local', 'hlabs')).toBe('.hlabs.local');
    expect(cookieDomain('HLABS.local:443', 'hlabs')).toBe('.hlabs.local');
    expect(cookieDomain('hlabs.tail1234.ts.net', 'hlabs')).toBeUndefined();
    expect(cookieDomain('192.168.1.20:7443', 'hlabs')).toBeUndefined();
    expect(cookieDomain('den.local', 'den')).toBe('.den.local');
    expect(cookieDomain(null, 'hlabs')).toBeUndefined();
  });

  it('remember off: a browser-session cookie and 12 hours idle; on: Max-Age 30 days and 30 days sliding', async () => {
    const d = await daemonWithAdmin(closers);
    const off = await logIn(d.url, false, 'hlabs.local');
    expect(off.setCookie).toMatch(
      /^hlabs_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Domain=\.hlabs\.local$/,
    );
    const on = await logIn(d.url, true, '127.0.0.1:5173');
    expect(on.setCookie).toMatch(/; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);

    const rows = d.services!.db.select().from(sessions).all().slice(-2);
    expect(rows[0]!.expiresAt - rows[0]!.createdAt).toBe(IDLE_MS);
    expect(rows[1]!.expiresAt - rows[1]!.createdAt).toBe(REMEMBER_MS);

    const me = async (cookie: string) =>
      (
        (await (await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie } })).json()) as {
          result: { data: { remember: boolean } };
        }
      ).result.data.remember;
    expect(await me(off.cookie)).toBe(false);
    expect(await me(on.cookie)).toBe(true);
  });

  it('activity slides the expiry at most once a minute', () => {
    return (async () => {
      const d = await daemonWithAdmin(closers);
      const { raw, expiresAt } = d.services!.sessions.create({ userId: d.userId, now: 0 });
      expect(d.services!.sessions.resolve(raw, 30_000)?.expiresAt).toBe(expiresAt);
      expect(d.services!.sessions.resolve(raw, 61_000)?.expiresAt).toBe(61_000 + IDLE_MS);
      expect(d.services!.sessions.resolve(raw, 61_000 + IDLE_MS)).toBeNull();
    })();
  });

  it('an expired session gets AUTH_REQUIRED (UNAUTHORIZED)', async () => {
    const d = await daemonWithAdmin(closers);
    d.services!.db.update(sessions).set({ expiresAt: 1 }).run();
    const res = await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie: d.cookie } });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { data: { hlabsCode: string } } }).error.data.hlabsCode).toBe(
      'AUTH_REQUIRED',
    );
  });
});
