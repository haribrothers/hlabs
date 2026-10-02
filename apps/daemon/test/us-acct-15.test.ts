// US-ACCT-15 · Change role, disable or enable someone (server side).
import { appAccess, apps, auditLog, sessions, users } from '@hlabs/db';
import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const login = (url: string, username: string, password = 'correct horse battery') =>
  fetch(`${url}/trpc/auth.login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(async (r) => (await r.json()) as { result?: unknown; error?: { data: { hlabsCode: string } } });

describe('US-ACCT-15', () => {
  it('Make admin keeps their app access rows; Make member gives the role back; both audited', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    db.insert(apps)
      .values({ id: 'immich', version: '1', state: 'running', hostname: 'immich', installedAt: 1, updatedAt: 1 })
      .run();
    const anu = await memberSession(d, { appIds: ['immich'] });
    await d.mutate('users.updateRole', { userId: anu.userId, role: 'admin' });
    expect(db.select().from(users).where(eq(users.id, anu.userId)).get()!.role).toBe('admin');
    expect(db.select().from(appAccess).where(eq(appAccess.userId, anu.userId)).all()).toHaveLength(1);
    await d.mutate('users.updateRole', { userId: anu.userId, role: 'member' });
    expect(db.select().from(users).where(eq(users.id, anu.userId)).get()!.role).toBe('member');
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'users.updateRole')).all()).toHaveLength(2);
  });

  it('Disable ends their sessions and they cannot log in (as a wrong password); Enable lets the old password work', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    const anu = await memberSession(d);
    await d.mutate('users.disable', { userId: anu.userId });
    expect(db.select().from(users).where(eq(users.id, anu.userId)).get()!.disabledAt).not.toBeNull();
    expect(
      db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, anu.userId), isNull(sessions.revokedAt)))
        .all(),
    ).toEqual([]);
    expect((await anu.query('auth.me')).status).toBe(401);
    expect((await login(d.url, 'anu')).error?.data.hlabsCode).toBe('AUTH_INVALID_CREDENTIALS');

    await d.mutate('users.enable', { userId: anu.userId });
    expect((await login(d.url, 'anu')).result).toBeDefined();
  });

  it('refuses to leave hlabs without an enabled admin', async () => {
    const d = await daemonWithAdmin(closers);
    expect((await d.mutate('users.updateRole', { userId: d.userId, role: 'member' })).error?.data.hlabsCode).toBe(
      'LAST_ADMIN',
    );
    expect((await d.mutate('users.disable', { userId: d.userId })).error?.data.hlabsCode).toBe('LAST_ADMIN');
    // With a second admin, it's allowed.
    const mia = await memberSession(d, { username: 'mia', role: 'admin' });
    expect((await d.mutate('users.disable', { userId: mia.userId })).result).toBeDefined();
    // Mia is disabled, so Hari is still the only enabled admin.
    expect((await d.mutate('users.updateRole', { userId: d.userId, role: 'member' })).error?.data.hlabsCode).toBe(
      'LAST_ADMIN',
    );
  });
});
