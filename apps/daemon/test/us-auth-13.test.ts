// US-AUTH-13 · Tell the admin about repeated failed logins.
import { auditLog, notifications } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { BusEntry } from '../src/events/bus';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-AUTH-13', () => {
  it('a lock notifies all admins once, is announced to admins and is audited', async () => {
    const d = await daemonWithAdmin(closers);
    const events: BusEntry[] = [];
    d.services!.bus.on((e) => events.push(e));
    const login = () =>
      d.services!.login.login({
        username: 'Hari',
        password: 'wrong',
        remember: false,
        ip: '10.0.0.9',
        userAgent: null,
      });
    for (let i = 0; i < 7; i++) await login().catch(() => {});

    const db = d.services!.db;
    const rows = db.select().from(notifications).where(eq(notifications.kind, 'auth.locked')).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: null,
      severity: 'warning',
      title: 'Repeated failed logins',
      body: '5 failed logins for @hari from 10.0.0.9. Logging in as @hari is paused for 15 minutes.',
    });
    const created = events.filter((e) => e.event.type === 'notification.created');
    expect(created).toHaveLength(1);
    expect(created[0]!.audience).toEqual({ kind: 'admins' });
    const audit = db.select().from(auditLog).where(eq(auditLog.action, 'auth.locked')).all();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.detailJson).toEqual({ username: 'hari', ip: '10.0.0.9' });
  });
});
