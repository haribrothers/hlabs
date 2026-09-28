// US-AUTH-04 · See a clear error when login fails (server side).
import { auditLog, loginAttempts, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string; detail: unknown } } };

async function login(url: string, username: string, password: string, headers: Record<string, string> = {}) {
  const started = performance.now();
  const res = await fetch(`${url}/trpc/auth.login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ username, password }),
  });
  return { body: (await res.json()) as Reply, ms: performance.now() - started };
}

describe('US-AUTH-04', () => {
  it('an unknown username, a wrong password and a disabled account all get the same answer', async () => {
    const d = await daemonWithAdmin(closers);
    expect((await login(d.url, 'nobody', 'whatever password')).body.error?.data.hlabsCode).toBe(
      'AUTH_INVALID_CREDENTIALS',
    );
    expect((await login(d.url, 'hari', 'wrong password!')).body.error?.data.hlabsCode).toBe('AUTH_INVALID_CREDENTIALS');
    d.services!.db.update(users).set({ disabledAt: Date.now() }).where(eq(users.username, 'hari')).run();
    expect((await login(d.url, 'hari', 'correct horse battery')).body.error?.data.hlabsCode).toBe(
      'AUTH_INVALID_CREDENTIALS',
    );
  });

  it('an unknown username takes as long as a wrong password (a dummy Argon2id verify)', async () => {
    const d = await daemonWithAdmin(closers);
    await login(d.url, 'warm-up', 'x'); // first call also makes the dummy hash
    // The fastest of a few tries each, so a busy machine doesn't decide the result.
    const fastest = async (username: string) => {
      const times: number[] = [];
      for (let i = 0; i < 3; i++) times.push((await login(d.url, username, `wrong password ${i}`)).ms);
      return Math.min(...times);
    };
    const wrong = await fastest('hari');
    const unknown = await fastest('nobody-at-all');
    expect(unknown).toBeGreaterThan(wrong * 0.5);
  });

  it('records each failure with the username as typed and the client IP from the proxy', async () => {
    const d = await daemonWithAdmin(closers);
    await login(d.url, 'Hari', 'wrong password!', { 'x-forwarded-for': '192.168.1.23' });
    const db = d.services!.db;
    expect(db.select().from(loginAttempts).all()).toEqual([
      expect.objectContaining({ username: 'hari', ip: '192.168.1.23', success: false }),
    ]);
    expect(db.select().from(auditLog).all()).toContainEqual(
      expect.objectContaining({ action: 'auth.login.failed', detailJson: { username: 'Hari' }, ip: '192.168.1.23' }),
    );
  });

  it('the fifth failure in 15 minutes for a username and IP is AUTH_LOCKED, and so is the right password then', async () => {
    const d = await daemonWithAdmin(closers);
    const codes: string[] = [];
    for (let i = 0; i < 5; i++)
      codes.push((await login(d.url, 'hari', `wrong ${i} password`)).body.error!.data.hlabsCode);
    expect(codes).toEqual([
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_LOCKED',
    ]);
    const locked = (await login(d.url, 'hari', 'correct horse battery')).body.error!;
    expect(locked.data.hlabsCode).toBe('AUTH_LOCKED');
    expect((locked.data.detail as { until: number }).until).toBeGreaterThan(Date.now());
    // Another IP isn't locked.
    expect(
      (await login(d.url, 'hari', 'correct horse battery', { 'x-forwarded-for': '10.0.0.9' })).body.result,
    ).toBeDefined();
  });
});
