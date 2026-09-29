// US-ACCT-04 · See the devices I am signed in on (server side).
import { sessions, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-04', () => {
  it("lists only my live sessions: this one first, then by last activity; never someone else's", async () => {
    const d = await daemonWithAdmin(closers);
    const s = d.services!;
    const now = Date.now();
    const other = ulid();
    s.db
      .insert(users)
      .values({ id: other, username: 'anu', displayName: 'Anu', role: 'member', passwordHash: 'x', createdAt: 1 })
      .run();
    const phone = s.sessions.create({ userId: d.userId, userAgent: 'iPhone', ip: '100.64.0.9' });
    const laptop = s.sessions.create({ userId: d.userId, userAgent: 'Windows', ip: '192.168.1.9' });
    s.sessions.create({ userId: other });
    const gone = s.sessions.create({ userId: d.userId });
    s.sessions.revoke({ sessionId: s.sessions.resolve(gone.raw)!.sessionId });
    // Expired: 12 h idle ended an hour ago.
    s.sessions.create({ userId: d.userId, now: now - 13 * 3_600_000 });
    // The phone was seen more recently than the laptop.
    const phoneId = s.sessions.resolve(phone.raw)!.sessionId;
    const laptopId = s.sessions.resolve(laptop.raw)!.sessionId;
    s.db
      .update(sessions)
      .set({ lastSeenAt: now - 60_000 })
      .where(eq(sessions.id, phoneId))
      .run();
    s.db
      .update(sessions)
      .set({ lastSeenAt: now - 600_000 })
      .where(eq(sessions.id, laptopId))
      .run();

    const items = ((await d.query('auth.listSessions')).result!.data as { items: Array<Record<string, unknown>> })
      .items;
    expect(items.map((i) => i.current)).toEqual([true, false, false]);
    expect(items.slice(1).map((i) => i.id)).toEqual([phoneId, laptopId]);
    expect(items[1]).toMatchObject({ userAgent: 'iPhone', ip: '100.64.0.9' });
  });
});
