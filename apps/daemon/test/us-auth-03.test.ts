// US-AUTH-03 · Log in with username and password (server side).
import { auditLog, loginAttempts, sessions, users } from '@hlabs/db';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { safeNext } from '../src/auth/login';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };

async function login(url: string, input: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await fetch(`${url}/trpc/auth.login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(input),
  });
  return { res, body: (await res.json()) as Reply };
}

describe('US-AUTH-03', () => {
  it('trims and lowercases the username, starts a new session and records it', async () => {
    const d = await daemonWithAdmin(closers);
    const { res, body } = await login(d.url, { username: ' Hari ', password: 'correct horse battery' });
    expect(body.result?.data).toEqual({ status: 'ok', redirectTo: '/' });
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^hlabs_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    // A new session, not the one from onboarding (no fixation).
    expect(cookie.split(';')[0]).not.toBe(d.cookie);

    const db = d.services!.db;
    expect(db.select().from(sessions).all()).toHaveLength(2);
    expect(db.select().from(loginAttempts).all()).toEqual([
      expect.objectContaining({ username: 'hari', success: true }),
    ]);
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .map((a) => a.action),
    ).toContain('auth.login.succeeded');
    expect(db.select().from(users).get()!.lastActiveAt).toBeGreaterThan(0);

    const me = (await (
      await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie: cookie.split(';')[0]! } })
    ).json()) as Reply;
    expect(me.result?.data.username).toBe('hari');
  });

  it('remember me keeps the session for 30 days', async () => {
    const d = await daemonWithAdmin(closers);
    const { res } = await login(d.url, { username: 'hari', password: 'correct horse battery', remember: true });
    const maxAge = Number(res.headers.get('set-cookie')!.match(/Max-Age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThan(29 * 24 * 3600);
  });

  it('goes to next when it is a path on this dashboard', async () => {
    const d = await daemonWithAdmin(closers);
    const { body } = await login(d.url, { username: 'hari', password: 'correct horse battery', next: '/files' });
    expect(body.result?.data.redirectTo).toBe('/files');
    expect(safeNext('https://evil.example/')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/login?next=/x')).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });

  it('with two-factor on, the password step asks for a code and starts no session', async () => {
    const d = await daemonWithAdmin(closers);
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) });
    const before = d.services!.db.select().from(sessions).all().length;

    const { res, body } = await login(d.url, { username: 'hari', password: 'correct horse battery' });
    expect(body.result?.data).toEqual({ status: 'totp_required', challengeId: expect.any(String) });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(d.services!.db.select().from(sessions).all()).toHaveLength(before);
  });

  it('is refused from another site', async () => {
    const d = await daemonWithAdmin(closers);
    const { body } = await login(
      d.url,
      { username: 'hari', password: 'correct horse battery' },
      { origin: 'https://evil.example' },
    );
    expect(body.error?.data.hlabsCode).toBe('CSRF_REJECTED');
  });
});
