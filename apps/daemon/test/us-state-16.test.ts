// US-STATE-16 · Notifications reach every open session and are marked read from any one (server side).
import type { HlabsEvent } from '@hlabs/api';
import { notifications, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const kumaFailed = {
  kind: 'app.startFailed',
  target: 'uptime-kuma',
  severity: 'critical' as const,
  title: "Uptime Kuma couldn't start",
  body: 'Port 3001 is already in use by another program.',
  actions: [
    { kind: 'navigate' as const, to: '/apps/uptime-kuma/logs' },
    { kind: 'mutation' as const, procedure: 'apps.start' as const, input: { appId: 'uptime-kuma' }, label: 'Retry' },
  ],
};

async function setup() {
  const d = await daemonWithAdmin(closers);
  d.services!.db.insert(users)
    .values({
      id: 'someone-else',
      username: 'sam',
      displayName: 'Sam',
      role: 'member',
      passwordHash: 'x',
      createdAt: 1,
    })
    .run();
  const events: Array<{ event: HlabsEvent; audience: unknown }> = [];
  d.services!.bus.on((e) => events.push({ event: e.event, audience: e.audience }));
  const list = async (input: Record<string, unknown> = {}) => {
    const res = await fetch(`${d.url}/trpc/notifications.list?input=${encodeURIComponent(JSON.stringify(input))}`, {
      headers: { cookie: d.cookie },
    });
    return (
      (await res.json()) as { result: { data: { items: Array<Record<string, unknown>>; nextCursor: string | null } } }
    ).result.data;
  };
  return { ...d, events, list };
}

describe('US-STATE-16', () => {
  it('a new notification is announced with everything a toast needs, to that user or to all admins', async () => {
    const d = await setup();
    const service = d.services!.notifications;
    const id = service.create({ userId: null, ...kumaFailed, now: 1000 });
    service.create({
      userId: d.userId,
      kind: 'auth.recoveryCodeUsed',
      severity: 'warning',
      title: 'Recovery code used',
    });
    expect(d.events.map((e) => e.audience)).toEqual([{ kind: 'admins' }, { kind: 'user', userId: d.userId }]);
    expect(d.events[0]!.event).toMatchObject({
      type: 'notification.created',
      data: { notificationId: id, ...kumaFailed, createdAt: 1000 },
    });
  });

  it('lists the reader’s own and, for admins, the all-admins ones; members never see admin ones', async () => {
    const d = await setup();
    const service = d.services!.notifications;
    service.create({ userId: null, ...kumaFailed, now: 1000 });
    service.create({ userId: d.userId, kind: 'mine', severity: 'info', title: 'Mine', now: 2000 });
    service.create({ userId: 'someone-else', kind: 'theirs', severity: 'info', title: 'Theirs', now: 3000 });
    const page = await d.list();
    expect(page.items.map((n) => n.title)).toEqual(['Mine', "Uptime Kuma couldn't start"]);
    expect(page.items[1]).toMatchObject({ target: 'uptime-kuma', actions: kumaFailed.actions, readAt: null });
    expect((await d.list({ since: 1500 })).items.map((n) => n.title)).toEqual(['Mine']);
    const first = await d.list({ limit: 1 });
    expect(first.nextCursor).not.toBeNull();
    expect((await d.list({ limit: 1, cursor: first.nextCursor })).items.map((n) => n.title)).toEqual([
      "Uptime Kuma couldn't start",
    ]);

    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    expect(service.list({ userId: d.userId, role: 'member' }, {}).items.map((n) => n.title)).toEqual(['Mine']);
  });

  it('markRead sets read_at, keeps the row, and tells the other sessions; others’ notifications are untouched', async () => {
    const d = await setup();
    const service = d.services!.notifications;
    const mine = service.create({ userId: d.userId, kind: 'mine', severity: 'warning', title: 'Mine' });
    const theirs = service.create({ userId: 'someone-else', kind: 'theirs', severity: 'warning', title: 'Theirs' });
    d.events.length = 0;
    expect((await d.mutate('notifications.markRead', { ids: [mine, theirs] })).result?.data).toEqual({ ok: true });
    const rows = d.services!.db.select().from(notifications).all();
    expect(rows.find((r) => r.id === mine)!.readAt).not.toBeNull();
    expect(rows.find((r) => r.id === theirs)!.readAt).toBeNull();
    expect(d.events).toEqual([
      {
        event: expect.objectContaining({ type: 'notification.read', data: { ids: [mine] } }),
        audience: { kind: 'user', userId: d.userId },
      },
    ]);
    // Already read: nothing more to announce.
    await d.mutate('notifications.markRead', { ids: [mine] });
    expect(d.events).toHaveLength(1);
  });
});
