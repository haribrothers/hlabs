// US-AUTH-12 · Pause logins after too many attempts (server side).
import { loginAttempts } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { LOGIN_ATTEMPTS_KEEP_MS, LOGIN_LOCK_MS, lockState } from '../src/auth/login';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const MIN = 60_000;
const fail = (at: number) => ({ at, success: false });

describe('US-AUTH-12', () => {
  it('5 failures in 15 minutes lock for 15 minutes from the fifth', () => {
    const t = 1_000_000_000;
    const five = [0, 1, 2, 3, 10].map((m) => fail(t + m * MIN));
    expect(lockState(five.slice(0, 4), t + 10 * MIN)).toEqual({ lockedUntil: null, failures: expect.any(Array) });
    expect(lockState(five, t + 11 * MIN).lockedUntil).toBe(t + 10 * MIN + LOGIN_LOCK_MS);
    // Still locked when the first failures have left the 15-minute window.
    expect(lockState(five, t + 20 * MIN).lockedUntil).toBe(t + 25 * MIN);
    // Over: a fresh count.
    expect(lockState(five, t + 25 * MIN)).toEqual({ lockedUntil: null, failures: [] });
    expect(lockState([...five, fail(t + 26 * MIN)], t + 26 * MIN)).toEqual({
      lockedUntil: null,
      failures: [t + 26 * MIN],
    });
  });

  it('5 failures spread over more than 15 minutes do not lock', () => {
    const t = 1_000_000_000;
    const spread = [0, 4, 8, 12, 16].map((m) => fail(t + m * MIN));
    expect(lockState(spread, t + 16 * MIN)).toEqual({
      lockedUntil: null,
      failures: [t + 4 * MIN, t + 8 * MIN, t + 12 * MIN, t + 16 * MIN],
    });
  });

  it('a completed log-in starts the count again', () => {
    const t = 1_000_000_000;
    const attempts = [fail(t), fail(t + 1), fail(t + 2), fail(t + 3), { at: t + 4, success: true }, fail(t + 5)];
    expect(lockState(attempts, t + 6)).toEqual({ lockedUntil: null, failures: [t + 5] });
  });

  it('while locked: AUTH_LOCKED with retryAfterSeconds, the password is not checked and the lock is not extended; other pairs work', async () => {
    const d = await daemonWithAdmin(closers);
    const login = (username: string, password: string, ip = '10.0.0.1') =>
      d.services!.login.login({ username, password, remember: false, ip, userAgent: null });
    for (let i = 0; i < 4; i++)
      await expect(login('hari', 'wrong')).rejects.toMatchObject({ cause: { hlabsCode: 'AUTH_INVALID_CREDENTIALS' } });
    await expect(login('hari', 'wrong')).rejects.toMatchObject({
      cause: { hlabsCode: 'AUTH_LOCKED', detail: { retryAfterSeconds: 900 } },
    });
    const rows = () => d.services!.db.select().from(loginAttempts).all().length;
    const before = rows();
    // The right password is refused too, and nothing is recorded.
    await expect(login('hari', 'correct horse battery')).rejects.toMatchObject({ cause: { hlabsCode: 'AUTH_LOCKED' } });
    expect(rows()).toBe(before);
    // Another IP, and another (unknown) username from this IP, are unaffected.
    expect((await login('hari', 'correct horse battery', '10.0.0.2')).kind).toBe('ok');
    await expect(login('nobody', 'wrong')).rejects.toMatchObject({ cause: { hlabsCode: 'AUTH_INVALID_CREDENTIALS' } });
  });

  it('an unknown username locks the same way', async () => {
    const d = await daemonWithAdmin(closers);
    const login = () =>
      d.services!.login.login({ username: 'nobody', password: 'x', remember: false, ip: '10.0.0.1', userAgent: null });
    for (let i = 0; i < 4; i++)
      await expect(login()).rejects.toMatchObject({ cause: { hlabsCode: 'AUTH_INVALID_CREDENTIALS' } });
    await expect(login()).rejects.toMatchObject({ cause: { hlabsCode: 'AUTH_LOCKED' } });
    await expect(login()).rejects.toMatchObject({ cause: { hlabsCode: 'AUTH_LOCKED' } });
  });

  it('attempts older than 30 days are pruned', async () => {
    const d = await daemonWithAdmin(closers);
    const db = d.services!.db;
    const now = Date.now();
    db.delete(loginAttempts).run();
    for (const at of [now - LOGIN_ATTEMPTS_KEEP_MS - 1, now - 1000]) {
      db.insert(loginAttempts).values({ id: ulid(), username: 'hari', ip: '1.1.1.1', at, success: false }).run();
    }
    expect(d.services!.login.pruneAttempts(now)).toBe(1);
    expect(db.select().from(loginAttempts).all()).toHaveLength(1);
  });
});
