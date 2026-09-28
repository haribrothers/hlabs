// US-AUTH-16 · Log out (server side).
import { auditLog } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-AUTH-16', () => {
  it('ends this session only, clears the cookie on the same domain and is audited', async () => {
    const d = await daemonWithAdmin(closers);
    const other = d.services!.sessions.create({ userId: d.userId });

    const res = await fetch(`${d.url}/trpc/auth.logout?batch=1`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: d.cookie,
        'x-hlabs-csrf': d.csrf,
        'x-forwarded-host': 'hlabs.local',
      },
      body: '{}',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBe(
      'hlabs_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Domain=.hlabs.local; Max-Age=0',
    );
    expect((await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie: d.cookie } })).status).toBe(401);
    expect(d.services!.sessions.resolve(other.raw)).not.toBeNull();
    const audit = d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'auth.logout')).all();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.userId).toBe(d.userId);
  });

  it('needs the CSRF header', async () => {
    const d = await daemonWithAdmin(closers);
    const res = await fetch(`${d.url}/trpc/auth.logout?batch=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: d.cookie },
      body: '{}',
    });
    expect(((await res.json()) as Array<{ error: { data: { hlabsCode: string } } }>)[0]!.error.data.hlabsCode).toBe(
      'CSRF_REJECTED',
    );
  });
});
