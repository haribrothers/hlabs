// US-HOME-13, 14 (server side): the bell's unread count, "Mark all read" and dismissing, each only over what the reader
// can see; an all-admins notification read or dismissed by one admin is so for every admin (D-155); the other sessions
// are told; and the lock notification opens Settings › Account.
import type { HlabsEvent } from '@hlabs/api';
import { notifications } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setup() {
  const d = await daemonWithAdmin(closers);
  const anu = await memberSession(d);
  // Anu joining told the admins; start from none.
  d.services!.db.delete(notifications).run();
  const service = d.services!.notifications;
  const forAdmins = service.create({ userId: null, kind: 'app.crashed', severity: 'warning', title: 'Kuma stopped' });
  const mine = service.create({ userId: d.userId, kind: 'mine', severity: 'info', title: 'Mine' });
  const anus = service.create({ userId: anu.userId, kind: 'shared', severity: 'success', title: 'Immich is ready' });
  const events: Array<{ event: HlabsEvent; audience: unknown }> = [];
  d.services!.bus.on((e) => events.push({ event: e.event, audience: e.audience }));
  const count = async (q: typeof d.query) => (await q('notifications.unreadCount')).result!.data.count;
  return { d, anu, service, events, count, ids: { forAdmins, mine, anus } };
}

describe('US-HOME-13 · the unread count', () => {
  it('counts what the reader can see and hasn’t read: an admin’s own and the all-admins ones; a member’s own', async () => {
    const { d, anu, count, ids, service } = await setup();
    expect(await count(d.query)).toBe(2);
    expect(await count(anu.query)).toBe(1);
    service.markRead({ userId: d.userId, role: 'admin' }, [ids.mine]);
    expect(await count(d.query)).toBe(1);
  });
});

describe('US-HOME-14', () => {
  it('"Mark all read" reads everything the reader can see, nothing else, and tells their other sessions', async () => {
    const { d, anu, count, events, ids } = await setup();
    expect((await d.mutate('notifications.markAllRead')).result?.data).toEqual({ ok: true });
    expect(await count(d.query)).toBe(0);
    expect(await count(anu.query)).toBe(1);
    const read = events.filter((e) => e.event.type === 'notification.read');
    expect(read).toEqual([
      { event: expect.objectContaining({ data: { ids: [ids.forAdmins] } }), audience: { kind: 'admins' } },
      { event: expect.objectContaining({ data: { ids: [ids.mine] } }), audience: { kind: 'user', userId: d.userId } },
    ]);
    // Nothing left: nothing more to announce.
    await d.mutate('notifications.markAllRead');
    expect(events.filter((e) => e.event.type === 'notification.read')).toHaveLength(2);
  });

  it('dismiss removes it from the list and tells the other sessions; a member can’t dismiss what isn’t theirs', async () => {
    const { d, anu, events, ids } = await setup();
    expect(
      (await anu.mutate('notifications.dismiss', { ids: [ids.forAdmins, ids.mine, ids.anus] })).result?.data,
    ).toEqual({
      ok: true,
    });
    const left = () =>
      d
        .services!.db.select({ id: notifications.id })
        .from(notifications)
        .all()
        .map((r) => r.id);
    expect(left().sort()).toEqual([ids.forAdmins, ids.mine].sort());
    expect(events).toEqual([
      {
        event: expect.objectContaining({ type: 'notification.dismissed', data: { ids: [ids.anus] } }),
        audience: { kind: 'user', userId: anu.userId },
      },
    ]);
  });

  it('an all-admins notification dismissed by one admin is gone for every admin (D-155)', async () => {
    const { d, events, ids } = await setup();
    await d.mutate('notifications.dismiss', { ids: [ids.forAdmins] });
    const other = await memberSession(d, { username: 'sam', role: 'admin' });
    const items = (await other.query('notifications.list', {})).result!.data.items as Array<{ id: string }>;
    expect(items.map((n) => n.id)).not.toContain(ids.forAdmins);
    expect(events.find((e) => e.event.type === 'notification.dismissed')?.audience).toEqual({ kind: 'admins' });
  });

  it('the lock notification opens Settings › Account, where sessions are', async () => {
    const { d } = await setup();
    for (let i = 0; i < 5; i++) {
      await fetch(`${d.url}/trpc/auth.login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'anu', password: 'wrong password here' }),
      });
    }
    const lock = d
      .services!.db.select()
      .from(notifications)
      .all()
      .find((n) => n.kind === 'auth.locked');
    expect(lock).toMatchObject({ title: 'Repeated failed logins', userId: null });
    expect(lock!.actionJson).toEqual([{ kind: 'navigate', to: '/settings/account' }]);
  });
});
