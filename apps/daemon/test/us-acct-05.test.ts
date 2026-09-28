// US-ACCT-05 · Sign out a device, or log out (server side).
import type { HlabsEvent } from '@hlabs/api';
import { auditLog, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-05', () => {
  it('signs out one of my devices: it gets 401 and hears session.revoked; audited; repeating is fine', async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    const phone = s.sessions.create({ userId: d.userId });
    const phoneId = s.sessions.resolve(phone.raw)!.sessionId;
    const heard: HlabsEvent[] = [];
    s.bus.on((e) => heard.push(e.event));

    expect((await d.mutate('auth.revokeSession', { sessionId: phoneId })).result?.data).toEqual({ ok: true });
    const me = await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie: `hlabs_session=${phone.raw}` } });
    expect(me.status).toBe(401);
    expect(heard).toContainEqual(expect.objectContaining({ type: 'session.revoked', data: { sessionId: phoneId } }));
    expect(s.db.select().from(auditLog).where(eq(auditLog.action, 'session.revoke')).all()).toHaveLength(1);
    // Again: still fine, nothing more to audit. My own session is untouched.
    expect((await d.mutate('auth.revokeSession', { sessionId: phoneId })).result?.data).toEqual({ ok: true });
    expect(s.db.select().from(auditLog).where(eq(auditLog.action, 'session.revoke')).all()).toHaveLength(1);
    expect((await d.query('auth.me')).result).toBeDefined();
  });

  it("can't sign out someone else's session", async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    const other = ulid();
    s.db
      .insert(users)
      .values({ id: other, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const theirs = s.sessions.create({ userId: other });
    const theirId = s.sessions.resolve(theirs.raw)!.sessionId;
    expect((await d.mutate('auth.revokeSession', { sessionId: theirId })).error?.data.hlabsCode).toBe('NOT_FOUND');
    expect(s.sessions.resolve(theirs.raw)).not.toBeNull();
  });
});
