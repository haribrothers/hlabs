// US-AUTH-15 · Get signed out when my session is revoked (server side).
import type { HlabsEvent } from '@hlabs/api';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** Collects what one device's event stream receives. */
function listen(d: Awaited<ReturnType<typeof daemonWithAdmin>>, sessionId: string) {
  const got: HlabsEvent[] = [];
  const ctrl = new AbortController();
  void (async () => {
    for await (const e of d.services!.bus.stream({
      listener: { kind: 'user', userId: d.userId, role: 'admin', sessionId },
      signal: ctrl.signal,
    })) {
      got.push(e[1]);
    }
  })();
  closers.push(async () => ctrl.abort());
  return got;
}

describe('US-AUTH-15', () => {
  it('a revoked session hears session.revoked on its own stream only, and is signed out', async () => {
    const d = await daemonWithAdmin(closers);
    const { sessions } = d.services!;
    const phone = sessions.create({ userId: d.userId });
    const laptop = sessions.create({ userId: d.userId });
    const phoneId = sessions.resolve(phone.raw)!.sessionId;
    const laptopId = sessions.resolve(laptop.raw)!.sessionId;
    const phoneHears = listen(d, phoneId);
    const laptopHears = listen(d, laptopId);
    await new Promise((r) => setTimeout(r, 10));

    expect(sessions.revoke({ sessionId: phoneId })).toEqual([phoneId]);
    await expect.poll(() => phoneHears.map((e) => e.type), { timeout: 5000 }).toEqual(['session.revoked']);
    expect(laptopHears).toEqual([]);
    expect(sessions.resolve(phone.raw)).toBeNull();

    const me = await fetch(`${d.url}/trpc/auth.me`, { headers: { cookie: `hlabs_session=${phone.raw}` } });
    expect(me.status).toBe(401);
  });

  it("all of a user's sessions can be ended, optionally keeping one", async () => {
    const d = await daemonWithAdmin(closers);
    const { sessions } = d.services!;
    const a = sessions.create({ userId: d.userId });
    const b = sessions.create({ userId: d.userId });
    const keep = sessions.resolve(a.raw)!.sessionId;
    const ended = sessions.revoke({ userId: d.userId, except: keep });
    expect(ended).toHaveLength(2); // b and the admin's own session from setup
    expect(sessions.resolve(a.raw)).not.toBeNull();
    expect(sessions.resolve(b.raw)).toBeNull();
    expect(sessions.revoke({ userId: d.userId, except: keep })).toEqual([]);
  });
});
