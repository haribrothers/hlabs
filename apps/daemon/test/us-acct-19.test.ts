// US-ACCT-19 · Require two-factor for everyone (server side).
import { userTotp } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-19', () => {
  it('needs two-factor on the admin first; then members without it must set it up and nobody can turn it off', async () => {
    const d = await daemonWithAdmin(closers);
    const anu = await memberSession(d);
    expect((await d.mutate('users.updatePolicy', { requireTotp: true })).error?.data.hlabsCode).toBe(
      'TOTP_REQUIRED_SELF_FIRST',
    );
    expect((await d.query('users.getPolicy')).result!.data.requireTotp).toBe(false);

    d.services!.db.insert(userTotp)
      .values({ userId: d.userId, secretRef: `totp:${d.userId}`, enabledAt: Date.now() })
      .run();
    expect((await d.mutate('users.updatePolicy', { requireTotp: true })).result!.data).toMatchObject({
      requireTotp: true,
    });

    expect((await anu.query('auth.me')).result!.data.mustSetupTotp).toBe(true);
    const off = await d.mutate('account.totp.disable', { password: 'correct horse battery', code: '000000' });
    expect(off.error?.data.hlabsCode).toBe('TOTP_REQUIRED_BY_ADMIN');
    // Turning the rule off needs nothing special.
    expect((await d.mutate('users.updatePolicy', { requireTotp: false })).result!.data).toMatchObject({
      requireTotp: false,
    });
  });
});
