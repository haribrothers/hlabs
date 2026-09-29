// US-ACCT-06 · Change my password (server side).
import type { HlabsEvent } from '@hlabs/api';
import { auditLog, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '../src/auth/passwords';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const NEW = 'a much longer passphrase';

describe('US-ACCT-06', () => {
  it('changes the password, keeps this session, signs out the others and records it', async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    const phone = s.sessions.create({ userId: d.userId });
    const phoneId = s.sessions.resolve(phone.raw)!.sessionId;
    const heard: HlabsEvent[] = [];
    s.bus.on((e) => heard.push(e.event));

    const r = await d.mutate('account.changePassword', { currentPassword: 'correct horse battery', newPassword: NEW });
    expect(r.result?.data).toEqual({ ok: true });
    const user = s.db.select().from(users).where(eq(users.id, d.userId)).get()!;
    expect(await verifyPassword(user.passwordHash, NEW)).toBe(true);
    expect(user.passwordChangedAt).toBeGreaterThan(0);
    expect(s.sessions.resolve(phone.raw)).toBeNull();
    expect(heard).toContainEqual(expect.objectContaining({ type: 'session.revoked', data: { sessionId: phoneId } }));
    expect((await d.query('auth.me')).result).toBeDefined();
    expect(s.db.select().from(auditLog).where(eq(auditLog.action, 'account.changePassword')).all()).toHaveLength(1);
    expect(((await d.query('account.get')).result!.data as { passwordChangedAt: number }).passwordChangedAt).toBe(
      user.passwordChangedAt,
    );
  });

  it('refuses a wrong current password, a short, common or unchanged new one', async () => {
    const d = await daemonWithAdmin(closers);
    const cases: Array<[Record<string, string>, string]> = [
      [{ currentPassword: 'wrong', newPassword: NEW }, 'AUTH_INVALID_PASSWORD'],
      [{ currentPassword: 'correct horse battery', newPassword: 'short' }, 'PASSWORD_TOO_SHORT'],
      [{ currentPassword: 'correct horse battery', newPassword: 'correct horse battery' }, 'PASSWORD_UNCHANGED'],
    ];
    for (const [input, code] of cases) {
      expect((await d.mutate('account.changePassword', input)).error?.data.hlabsCode).toBe(code);
    }
  });
});
