// US-ACCT-24 · Choose which apps a member can open (server side).
import { appAccess, appSources, apps, auditLog, catalogApps, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setup() {
  const d = await daemonWithAdmin(closers);
  const { db } = d.services!;
  db.insert(appSources)
    .values({ id: 'builtin', kind: 'builtin', name: 'hlabs', url: 'builtin:' })
    .onConflictDoNothing()
    .run();
  for (const [id, name, ownLogin] of [
    ['jellyfin', 'Jellyfin', false],
    ['vaultwarden', 'Vaultwarden', true],
  ] as const) {
    db.insert(catalogApps)
      .values({
        sourceId: 'builtin',
        appId: id,
        version: '1',
        manifestJson: { name, ownLogin },
        updatedAt: 1,
        firstSeenAt: 1,
      })
      .run();
    db.insert(apps)
      .values({ id, sourceId: 'builtin', version: '1', state: 'running', hostname: id, installedAt: 1, updatedAt: 1 })
      .run();
  }
  const anu = ulid();
  db.insert(users)
    .values({ id: anu, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
    .run();
  return { d, db, anu };
}

describe('US-ACCT-24', () => {
  it('apps.list says which apps use their own login too', async () => {
    const { d } = await setup();
    const listed = (await d.query('apps.list')).result!.data.apps as Array<{ id: string; ownLogin: boolean }>;
    expect(Object.fromEntries(listed.map((a) => [a.id, a.ownLogin]))).toEqual({ jellyfin: false, vaultwarden: true });
  });

  it("replaces the access in one go, ignores apps that aren't installed, audits it and tells their dashboards", async () => {
    const { d, db, anu } = await setup();
    const heard: unknown[] = [];
    d.services!.bus.on((e) => {
      if (e.event.type === 'access.changed') heard.push({ data: e.event.data, audience: e.audience });
    });
    db.insert(appAccess).values({ appId: 'vaultwarden', userId: anu }).run();

    expect((await d.mutate('users.setAppAccess', { userId: anu, appIds: ['jellyfin', 'gone'] })).result!.data).toEqual({
      ok: true,
    });
    expect(
      (await d.query(`users.get?input=${encodeURIComponent(JSON.stringify({ userId: anu }))}`)).result!.data,
    ).toMatchObject({
      username: 'anu',
      role: 'member',
      appIds: ['jellyfin'],
    });
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'users.setAppAccess')).get()).toMatchObject({
      userId: d.userId,
      target: anu,
    });
    expect(heard).toEqual([{ data: { userId: anu }, audience: { kind: 'user', userId: anu } }]);

    // The row's count follows.
    const list = (await d.query('users.list')).result!.data.users as Array<{ id: string; appCount: number }>;
    expect(list.find((u) => u.id === anu)?.appCount).toBe(1);
  });

  it("an unknown person is NOT_FOUND; members can't change access", async () => {
    const { d, db, anu } = await setup();
    expect((await d.mutate('users.setAppAccess', { userId: 'nobody', appIds: [] })).error?.data.hlabsCode).toBe(
      'NOT_FOUND',
    );
    db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    expect((await d.mutate('users.setAppAccess', { userId: anu, appIds: [] })).error?.data.hlabsCode).toBe(
      'ACCESS_DENIED',
    );
  });
});
