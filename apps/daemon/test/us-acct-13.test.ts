// US-ACCT-13 · See everyone who uses hlabs (server side): users.list and invites.list, admins only.
import { appAccess, apps, invites, users, userTotp } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { inviteTokenRef } from '../src/invites/invites';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const DAY = 86_400_000;

describe('US-ACCT-13', () => {
  it('lists admins first, with two-factor, last active, disabled and the app count', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    const anu = ulid();
    const ravi = ulid();
    db.insert(users)
      .values([
        {
          id: anu,
          username: 'anu',
          displayName: 'Anu',
          role: 'member',
          passwordHash: 'x',
          createdAt: 1,
          lastActiveAt: 5,
        },
        {
          id: ravi,
          username: 'ravi',
          displayName: 'Ravi',
          role: 'member',
          passwordHash: 'x',
          createdAt: 2,
          disabledAt: 9,
        },
      ])
      .run();
    db.insert(userTotp).values({ userId: anu, secretRef: 'totp:anu', enabledAt: 3 }).run();
    for (const id of ['jellyfin', 'immich'])
      db.insert(apps).values({ id, version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 }).run();
    db.insert(appAccess)
      .values([
        { appId: 'jellyfin', userId: anu },
        { appId: 'immich', userId: anu },
      ])
      .run();

    const list = (await d.query('users.list')).result!.data.users as Array<Record<string, unknown>>;
    expect(list.map((u) => u.username)).toEqual(['hari', 'anu', 'ravi']);
    expect(list[0]).toMatchObject({ id: d.userId, role: 'admin', disabled: false });
    // The admin's session counts as activity.
    expect(list[0]!.lastActiveAt).toBeGreaterThan(Date.now() - 60_000);
    expect(list[1]).toMatchObject({ role: 'member', totpEnabled: true, lastActiveAt: 5, appCount: 2, disabled: false });
    expect(list[2]).toMatchObject({ totpEnabled: false, lastActiveAt: null, appCount: 0, disabled: true });
    // Nothing secret leaves the daemon.
    expect(JSON.stringify(list)).not.toContain('passwordHash');
  });

  it('lists only pending invites, newest first, with the link first created', async () => {
    const d = await daemonWithAdmin(closers);
    const { db, secrets } = d.services!;
    const now = Date.now();
    const pending = (id: string, createdAt: number) => ({
      id,
      tokenHash: `h-${id}`,
      tokenRef: inviteTokenRef(id),
      role: 'member' as const,
      createdBy: d.userId,
      createdAt,
      expiresAt: createdAt + 7 * DAY,
    });
    db.insert(invites)
      .values([
        pending('older', now - 2 * DAY),
        pending('newer', now - DAY),
        { ...pending('used', now), usedAt: now },
        { ...pending('revoked', now), revokedAt: now },
        pending('expired', now - 8 * DAY),
      ])
      .run();
    await secrets.set(inviteTokenRef('newer'), 'tok-newer');
    await secrets.set(inviteTokenRef('older'), 'tok-older');

    const list = (await d.query('invites.list')).result!.data.invites as Array<Record<string, unknown>>;
    expect(list.map((i) => i.id)).toEqual(['newer', 'older']);
    expect(list[0]).toMatchObject({ role: 'member', url: 'https://hlabs.local/invite/tok-newer' });
    expect(list[0]!.expiresAt).toBe(now - DAY + 7 * DAY);
  });

  it('members get ACCESS_DENIED for both lists', async () => {
    const d = await daemonWithAdmin(closers);
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    for (const path of ['users.list', 'invites.list']) {
      const res = await fetch(`${d.url}/trpc/${path}`, { headers: { cookie: d.cookie } });
      expect(res.status).toBe(403);
    }
  });
});
