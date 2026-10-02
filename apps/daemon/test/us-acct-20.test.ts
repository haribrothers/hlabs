// US-ACCT-20 · Decide what members can do (server side): installing and live usage for members.
import { appAccess, getSetting, setSetting } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { installDaemon } from './install-harness';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-20', () => {
  it('both switches start off', async () => {
    const { d } = await installDaemon(closers);
    expect((await d.query('users.getPolicy')).result!.data).toMatchObject({
      membersCanInstall: false,
      membersCanSeeUsage: false,
    });
  });

  it('install off: a member is refused; on: they install from the built-in store and the app is shared with them', async () => {
    const { d, s } = await installDaemon(closers);
    const anu = await memberSession(d);
    const refused = await anu.mutate('apps.install', { appId: 'uptime-kuma' });
    expect(refused.status).toBe(403);
    expect(refused.error?.data.hlabsCode).toBe('ACCESS_DENIED');

    await d.mutate('users.updatePolicy', { membersCanInstall: true });
    const started = await anu.mutate('apps.install', { appId: 'uptime-kuma' });
    expect(started.result?.data).toHaveProperty('jobId');
    expect(s.db.select().from(appAccess).where(eq(appAccess.userId, anu.userId)).all()).toEqual([
      { appId: 'uptime-kuma', userId: anu.userId },
    ]);
    expect((await anu.query('auth.me')).result!.data.canInstallApps).toBe(true);
  });

  it('live usage: usage.* refuses members unless both "See live usage" switches are on', async () => {
    const { d, s } = await installDaemon(closers);
    const anu = await memberSession(d);
    const usage = async () => (await anu.query('usage.current')).error?.data.hlabsCode;
    expect(await usage()).toBe('ACCESS_DENIED');
    setSetting(s.db, 'people', { ...getSetting(s.db, 'people'), membersCanSeeUsage: true });
    expect(await usage()).toBe('ACCESS_DENIED');
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: [], canSeeUsage: true });
    // Allowed now: whatever usage.* answers, it isn't a refusal (live usage itself ships in phase 4).
    expect(await usage()).not.toBe('ACCESS_DENIED');
  });
});
