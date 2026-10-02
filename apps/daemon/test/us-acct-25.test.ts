// US-ACCT-25 · Shared folder and live usage for a member (server side). Files' /shared checks arrive with Files
// (phase 5) and the Usage tab with live usage (phase 4, D-036); here the switches are stored and auth.me follows them.
import { getSetting, setSetting, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-25', () => {
  it('both switches start off and are saved with the apps, in the same request', async () => {
    const d = await daemonWithAdmin(closers);
    const anu = await memberSession(d);
    const row = () => d.services!.db.select().from(users).where(eq(users.id, anu.userId)).get()!;
    expect(row()).toMatchObject({ canSeeShared: false, canSeeUsage: false });
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: [], canSeeShared: true, canSeeUsage: true });
    expect(row()).toMatchObject({ canSeeShared: true, canSeeUsage: true });
    // Leaving them out keeps them.
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: [] });
    expect(row()).toMatchObject({ canSeeShared: true, canSeeUsage: true });
  });

  it('the Usage tab (auth.me.canSeeUsage) needs both their switch and "See live usage" for members', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    const anu = await memberSession(d);
    const canSee = async () => (await anu.query('auth.me')).result!.data.canSeeUsage;
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: [], canSeeUsage: true });
    expect(await canSee()).toBe(false);
    setSetting(db, 'people', { ...getSetting(db, 'people'), membersCanSeeUsage: true });
    expect(await canSee()).toBe(true);
    await d.mutate('users.setAppAccess', { userId: anu.userId, appIds: [], canSeeUsage: false });
    expect(await canSee()).toBe(false);
  });
});
