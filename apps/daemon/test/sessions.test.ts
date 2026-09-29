// Sessions and CSRF (07 §7.3), and setup access once an admin exists (US-ONB-03).
import { sessions, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { csrfTokenFor, IDLE_MS, readCookie, REMEMBER_MS, sessionCookie, SessionService } from '../src/auth/sessions';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function daemonWithUser(role: 'admin' | 'member' = 'admin', config = {}) {
  const printed: string[] = [];
  const d = await startDaemon({
    config: { devAnonymousAdmin: false, ...config },
    boot: { print: (l) => printed.push(l) },
  });
  closers.push(d.close);
  const token = new URL(printed.join('').match(/open (\S+)/)![1]!).searchParams.get('token')!;
  const userId = ulid();
  d.services!.db.insert(users)
    .values({ id: userId, username: 'hari', displayName: 'Hari', role, passwordHash: 'x', createdAt: Date.now() })
    .run();
  const s = d.services!.sessions.create({ userId });
  return { ...d, token, userId, raw: s.raw };
}

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string } } };
async function call(
  url: string,
  path: string,
  opts: { cookie?: string; headers?: Record<string, string>; input?: unknown; mutation?: boolean } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...opts.headers };
  if (opts.cookie) headers.cookie = `hlabs_session=${opts.cookie}`;
  const res = opts.mutation
    ? await fetch(`${url}/trpc/${path}`, { method: 'POST', headers, body: JSON.stringify(opts.input ?? null) })
    : await fetch(`${url}/trpc/${path}`, { headers });
  return (await res.json()) as Reply;
}

describe('sessions (07 §7.3)', () => {
  it('stores only the SHA-256 of the id and resolves the user, sliding the 12 h idle timeout', async () => {
    const d = await daemonWithUser();
    const svc = new SessionService(d.services!.db);
    const t0 = 1_000_000_000_000;
    const { raw } = svc.create({ userId: d.userId, now: t0 });
    expect(
      d
        .services!.db.select()
        .from(sessions)
        .all()
        .some((r) => r.id === raw),
    ).toBe(false);
    expect(svc.resolve(raw, t0 + 1000)).toMatchObject({ userId: d.userId, role: 'admin', expiresAt: t0 + IDLE_MS });
    // Used again after 2 h: expiry moves to 12 h from then.
    expect(svc.resolve(raw, t0 + 2 * 3600e3)?.expiresAt).toBe(t0 + 2 * 3600e3 + IDLE_MS);
    expect(svc.resolve(raw, t0 + 2 * 3600e3 + IDLE_MS + 1)).toBeNull();
    expect(svc.resolve('unknown')).toBeNull();
  });

  it('remember me lasts 30 days; revoked sessions and disabled users are signed out', async () => {
    const d = await daemonWithUser();
    const svc = new SessionService(d.services!.db);
    const kept = svc.create({ userId: d.userId, remember: true, now: 0 });
    expect(kept.expiresAt).toBe(REMEMBER_MS);
    const revoked = svc.create({ userId: d.userId });
    d.services!.db.update(sessions).set({ revokedAt: Date.now() }).where(eq(sessions.userId, d.userId)).run();
    expect(svc.resolve(revoked.raw)).toBeNull();
    const again = svc.create({ userId: d.userId });
    d.services!.db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, d.userId)).run();
    expect(svc.resolve(again.raw)).toBeNull();
  });

  it('sets HttpOnly, Secure, SameSite=Lax cookies, persistent only with remember me', () => {
    expect(sessionCookie('abc', { remember: false, expiresAt: 0 })).toBe(
      'hlabs_session=abc; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
    expect(sessionCookie('abc', { remember: true, expiresAt: 60_000, now: 0 })).toContain('Max-Age=60');
    expect(readCookie('a=1; hlabs_session=xyz; b=2', 'hlabs_session')).toBe('xyz');
    expect(readCookie(undefined, 'hlabs_session')).toBeNull();
  });

  it('auth.me returns the user and the CSRF token, only with a real session', async () => {
    const d = await daemonWithUser();
    expect((await call(d.url, 'auth.me', { cookie: d.raw })).result?.data).toMatchObject({
      id: d.userId,
      username: 'hari',
      role: 'admin',
      csrfToken: csrfTokenFor(d.raw),
    });
    expect((await call(d.url, 'auth.me')).error?.data.hlabsCode).toBe('AUTH_REQUIRED');
  });
});

describe('setup access once an admin exists (US-ONB-03) and CSRF', () => {
  it('the setup token no longer works; the admin session with the CSRF header does', async () => {
    const d = await daemonWithUser();
    const input = { step: 'welcome' };
    const byToken = await call(d.url, 'onboarding.setStep', {
      mutation: true,
      input,
      headers: { 'x-hlabs-setup': d.token },
    });
    expect(byToken.error?.data.hlabsCode).toBe('AUTH_REQUIRED');

    const noCsrf = await call(d.url, 'onboarding.setStep', { mutation: true, input, cookie: d.raw });
    expect(noCsrf.error?.data.hlabsCode).toBe('CSRF_REJECTED');

    const ok = await call(d.url, 'onboarding.setStep', {
      mutation: true,
      input,
      cookie: d.raw,
      headers: { 'x-hlabs-csrf': csrfTokenFor(d.raw), origin: 'http://127.0.0.1:5173' },
    });
    expect(ok.result?.data).toEqual({ ok: true });
  });

  it('refuses a session mutation from another origin even with the CSRF header', async () => {
    const d = await daemonWithUser();
    const res = await call(d.url, 'onboarding.setStep', {
      mutation: true,
      input: { step: 'welcome' },
      cookie: d.raw,
      headers: { 'x-hlabs-csrf': csrfTokenFor(d.raw), origin: 'https://evil.example' },
    });
    expect(res.error?.data.hlabsCode).toBe('CSRF_REJECTED');
  });

  it('a member session cannot use setup procedures', async () => {
    const d = await daemonWithUser('member');
    const res = await call(d.url, 'onboarding.setStep', {
      mutation: true,
      input: { step: 'welcome' },
      cookie: d.raw,
      headers: { 'x-hlabs-csrf': csrfTokenFor(d.raw) },
    });
    expect(res.error?.data.hlabsCode).toBe('ACCESS_DENIED');
  });

  it('queries need no CSRF header', async () => {
    const d = await daemonWithUser();
    expect((await call(d.url, 'onboarding.checkSystem', { cookie: d.raw })).result).toBeDefined();
  });
});
