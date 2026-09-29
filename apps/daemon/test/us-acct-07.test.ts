// US-ACCT-07 · Password change errors (server side).
import { loginAttempts } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const NEW = 'a much longer passphrase';

describe('US-ACCT-07', () => {
  it('refuses a common new password', async () => {
    const d = await daemonWithAdmin(closers);
    const r = await d.mutate('account.changePassword', {
      currentPassword: 'correct horse battery',
      newPassword: 'q1w2e3r4t5y6',
    });
    expect(r.error?.data.hlabsCode).toBe('PASSWORD_TOO_COMMON');
  });

  it('wrong current passwords count toward the log-in lockout: the fifth locks, then even the right one waits', async () => {
    const d = await daemonWithAdmin(closers);
    const change = (currentPassword: string) =>
      d.mutate('account.changePassword', { currentPassword, newPassword: NEW });
    for (let i = 0; i < 4; i++) expect((await change('wrong')).error?.data.hlabsCode).toBe('AUTH_INVALID_PASSWORD');
    const fifth = await change('wrong');
    expect(fifth.error?.data).toMatchObject({ hlabsCode: 'AUTH_LOCKED', detail: { retryAfterSeconds: 900 } });
    expect((await change('correct horse battery')).error?.data.hlabsCode).toBe('AUTH_LOCKED');
    const failed = d.services!.db.select().from(loginAttempts).where(eq(loginAttempts.username, 'hari')).all();
    expect(failed.filter((a) => !a.success)).toHaveLength(5);
    // Logging in as hari from this address is paused too.
    await expect(
      d.services!.login.login({
        username: 'hari',
        password: 'correct horse battery',
        remember: false,
        ip: '127.0.0.1',
        userAgent: null,
      }),
    ).rejects.toMatchObject({ cause: { hlabsCode: 'AUTH_LOCKED' } });
  });
});
