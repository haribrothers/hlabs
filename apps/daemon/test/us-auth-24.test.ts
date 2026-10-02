// US-AUTH-24 · Create my account from an invite (server side).
import { appAccess, apps, auditLog, invites, notifications, sessions, storageLocations, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { tempDir } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Reply = { result?: { data: Record<string, unknown> }; error?: { data: { hlabsCode: string; detail?: unknown } } };

async function setup() {
  const d = await daemonWithAdmin(closers);
  const { db } = d.services!;
  const root = tempDir('hlabs-root-');
  db.insert(storageLocations)
    .values({ id: ulid(), kind: 'local', name: 'This computer', path: root, isRoot: true })
    .run();
  for (const id of ['jellyfin', 'immich'])
    db.insert(apps).values({ id, version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 }).run();
  const invite = async (input: Record<string, unknown>) => {
    const made = (await d.mutate('invites.create', input)).result!.data as { inviteId: string; url: string };
    return { ...made, token: made.url.split('/invite/')[1]! };
  };
  /** As the invitee's browser: no session. */
  const accept = async (input: Record<string, unknown>) => {
    const res = await fetch(`${d.url}/trpc/invites.accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Anu', username: 'anu', password: 'correct horse battery', ...input }),
    });
    return { res, body: (await res.json()) as Reply };
  };
  return { d, db, root, invite, accept };
}

describe('US-AUTH-24', () => {
  it('a member invite makes a member with the shared apps, a Home folder and a session (not remembered)', async () => {
    const { d, db, root, invite, accept } = await setup();
    const { token, inviteId } = await invite({ role: 'member', appIds: ['jellyfin', 'gone'] });
    const { res, body } = await accept({ token, displayName: '  Anu ', username: 'Anu' });
    expect(body.result?.data).toEqual({ redirectTo: '/' });

    const user = db.select().from(users).where(eq(users.username, 'anu')).get()!;
    expect(user).toMatchObject({ role: 'member', displayName: 'Anu', disabledAt: null });
    expect(db.select().from(appAccess).where(eq(appAccess.userId, user.id)).all()).toEqual([
      { appId: 'jellyfin', userId: user.id },
    ]);
    expect(db.select().from(invites).where(eq(invites.id, inviteId)).get()!.usedAt).not.toBeNull();
    expect(existsSync(join(root, 'users', 'anu'))).toBe(true);
    expect(await d.services!.secrets.get(`invite:${inviteId}`)).toBeNull();

    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
    expect(db.select().from(sessions).where(eq(sessions.userId, user.id)).get()).toMatchObject({ remember: false });
    const me = (await (
      await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie: cookie.split(';')[0]! } })
    ).json()) as Reply;
    expect(me.result?.data).toMatchObject({ username: 'anu', role: 'member' });

    expect(db.select().from(auditLog).where(eq(auditLog.action, 'invite.accepted')).get()).toMatchObject({
      userId: user.id,
      target: inviteId,
    });
    expect(db.select().from(notifications).where(eq(notifications.userId, d.userId)).all()).toEqual([
      expect.objectContaining({ title: 'Anu joined hlabs' }),
    ]);
  });

  it('an admin invite makes an admin, with no app access rows', async () => {
    const { db, invite, accept } = await setup();
    const { token } = await invite({ role: 'admin', appIds: ['jellyfin'] });
    await accept({ token });
    const user = db.select().from(users).where(eq(users.username, 'anu')).get()!;
    expect(user.role).toBe('admin');
    expect(db.select().from(appAccess).all()).toEqual([]);
  });

  it('works once: a second accept, or two at once, makes one account', async () => {
    const { db, invite, accept } = await setup();
    const { token } = await invite({ role: 'member' });
    const [a, b] = await Promise.all([accept({ token, username: 'anu' }), accept({ token, username: 'ravi' })]);
    const codes = [a.body.error?.data.hlabsCode, b.body.error?.data.hlabsCode];
    expect(codes.filter((c) => c === 'INVITE_INVALID')).toHaveLength(1);
    expect(db.select().from(users).all()).toHaveLength(2);
    expect((await accept({ token, username: 'mia' })).body.error?.data.hlabsCode).toBe('INVITE_INVALID');
  });

  it('a taken username, a bad username or a weak password keep the invite usable', async () => {
    const { invite, accept } = await setup();
    const { token } = await invite({ role: 'member' });
    expect((await accept({ token, username: 'hari' })).body.error?.data.hlabsCode).toBe('USERNAME_TAKEN');
    expect((await accept({ token, username: '1x' })).body.error?.data.hlabsCode).toBe('USERNAME_INVALID');
    expect((await accept({ token, password: 'short' })).body.error?.data.hlabsCode).toBe('PASSWORD_TOO_SHORT');
    expect((await accept({ token, password: 'password1234' })).body.error?.data.hlabsCode).toBe('PASSWORD_TOO_COMMON');
    expect((await accept({ token })).body.result?.data).toEqual({ redirectTo: '/' });
  });

  it('5 dead links from one IP in 15 minutes pause accepting from it', async () => {
    const { invite, accept } = await setup();
    for (let i = 0; i < 5; i++)
      expect((await accept({ token: `guess-${i}` })).body.error?.data.hlabsCode).toBe('INVITE_INVALID');
    const { token } = await invite({ role: 'member' });
    const locked = await accept({ token });
    expect(locked.body.error?.data.hlabsCode).toBe('AUTH_LOCKED');
    expect(locked.res.status).toBe(429);
  });
});
