// US-SYS-37 · Confirm a factory reset (server side): system.factoryReset needs the hostname typed exactly and the
// admin's password; a wrong password is AUTH_INVALID_PASSWORD and counts towards the lockout; a member, a session from
// before the person stopped being an admin (stale) and a caller without a session are refused (FORBIDDEN). Nothing is
// deleted, and no job starts, when it's refused.
import { jobs, loginAttempts, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin, type Reply } from './admin-session';
import { startDaemon } from './helpers';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const PASSWORD = 'correct horse battery';

async function setup() {
  let restarts = 0;
  const d = await daemonWithAdmin(closers, {}, { restartDaemon: () => void restarts++ });
  const reset = (input: Record<string, unknown>) =>
    d.mutate('system.factoryReset', { password: PASSWORD, confirmHostname: 'hlabs', keepHomeFolders: false, ...input });
  const nothingHappened = async () => {
    expect(
      d
        .services!.db.select()
        .from(jobs)
        .all()
        .filter((j) => j.kind === 'factory_reset'),
    ).toEqual([]);
    expect((await fetch(`${d.url}/healthz`)).status).toBe(200);
    expect(restarts).toBe(0);
  };
  return { d, reset, nothingHappened };
}

describe('US-SYS-37', () => {
  it('needs the hostname typed exactly', async () => {
    const { reset, nothingHappened } = await setup();
    for (const typed of ['Hlabs', 'hlabs ', '', 'RESET']) {
      expect(((await reset({ confirmHostname: typed })) as Reply).error?.data.hlabsCode, typed).toBe(
        'VALIDATION_FAILED',
      );
    }
    await nothingHappened();
  });

  it('a wrong password says so and counts towards the lockout', async () => {
    const { d, reset, nothingHappened } = await setup();
    expect(((await reset({ password: 'wrong' })) as Reply).error?.data.hlabsCode).toBe('AUTH_INVALID_PASSWORD');
    expect(
      d
        .services!.db.select()
        .from(loginAttempts)
        .all()
        .filter((a) => !a.success),
    ).toHaveLength(1);
    for (let i = 0; i < 4; i++) await reset({ password: 'wrong' });
    expect(((await reset({})) as Reply).error?.data.hlabsCode).toBe('AUTH_LOCKED');
    await nothingHappened();
  });

  it('a member, a stale session and a caller without a session are refused', async () => {
    const { d, nothingHappened } = await setup();
    const anu = await memberSession(d);
    const input = { password: PASSWORD, confirmHostname: 'hlabs' };
    const member = await anu.mutate('system.factoryReset', input);
    expect(member.status).toBe(403);
    expect(member.error?.data.hlabsCode).toBe('ACCESS_DENIED');

    // Priya was an admin when she signed in; she isn't any more.
    const priya = await memberSession(d, { username: 'priya', role: 'admin' });
    d.services!.db.update(users).set({ role: 'member' }).where(eq(users.username, 'priya')).run();
    const stale = await priya.mutate('system.factoryReset', input);
    expect(stale.status).toBe(403);

    // The development-only anonymous admin has no session, so no password of its own.
    const anon = await startDaemon();
    closers.push(anon.close);
    const res = await fetch(`${anon.url}/trpc/system.factoryReset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(res.status).toBe(403);
    await nothingHappened();
  });
});
