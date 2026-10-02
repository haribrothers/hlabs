// US-ACCT-14 · Give a member a reset-password link (server side): users.resetPasswordLink and auth.resetPassword.
import { auditLog, passwordResets, sessions, users } from '@hlabs/db';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const MIN = 60_000;

async function setup() {
  const d = await daemonWithAdmin(closers);
  const anu = await memberSession(d);
  const link = async () => {
    const r = (await d.mutate('users.resetPasswordLink', { userId: anu.userId })).result!.data as {
      url: string;
      expiresAt: number;
    };
    return { ...r, token: r.url.match(/^https:\/\/hlabs\.local\/reset\/([A-Za-z0-9_-]{43})$/)![1]! };
  };
  /** As the member's browser, signed out. */
  const reset = async (token: string, newPassword = 'a brand new long passphrase') => {
    const res = await fetch(`${d.url}/trpc/auth.resetPassword`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    return (await res.json()) as { result?: unknown; error?: { data: { hlabsCode: string } } };
  };
  return { d, anu, link, reset };
}

describe('US-ACCT-14', () => {
  it('a one-time link to https://<hostname>/reset/<token>, expiring in 15 minutes, audited', async () => {
    const { d, anu, link } = await setup();
    const before = Date.now();
    const { expiresAt } = await link();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 15 * MIN);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 15 * MIN);
    expect(
      d.services!.db.select().from(passwordResets).where(eq(passwordResets.userId, anu.userId)).get(),
    ).toMatchObject({
      createdVia: 'admin',
      usedAt: null,
    });
    expect(
      d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'users.resetPasswordLink')).get()?.target,
    ).toBe(anu.userId);
  });

  it('a new link stops the earlier one', async () => {
    const { link, reset } = await setup();
    const first = await link();
    const second = await link();
    expect((await reset(first.token)).error?.data.hlabsCode).toBe('AUTH_RESET_EXPIRED');
    expect((await reset(second.token)).result).toBeDefined();
  });

  it('using it sets the new password, signs them out everywhere, and works only once', async () => {
    const { d, anu, link, reset } = await setup();
    const { token } = await link();
    expect((await reset(token, 'short')).error?.data.hlabsCode).toBe('PASSWORD_TOO_SHORT');
    expect((await reset(token)).result).toBeDefined();
    const { db } = d.services!;
    expect(
      db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, anu.userId), isNull(sessions.revokedAt)))
        .all(),
    ).toEqual([]);
    expect(db.select().from(users).where(eq(users.id, anu.userId)).get()!.passwordChangedAt).not.toBeNull();
    expect((await reset(token)).error?.data.hlabsCode).toBe('AUTH_RESET_EXPIRED');
    const login = await fetch(`${d.url}/trpc/auth.login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'anu', password: 'a brand new long passphrase' }),
    });
    expect(((await login.json()) as { result?: unknown }).result).toBeDefined();
  });

  it('older than 15 minutes it has expired', async () => {
    const { d, anu, link, reset } = await setup();
    const { token } = await link();
    d.services!.db.update(passwordResets)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(passwordResets.userId, anu.userId))
      .run();
    expect((await reset(token)).error?.data.hlabsCode).toBe('AUTH_RESET_EXPIRED');
  });
});
