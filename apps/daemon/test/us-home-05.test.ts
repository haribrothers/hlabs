// US-HOME-05 · Badges and member navigation (server side): auth.me says which optional areas this person gets.
import { setSetting, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-HOME-05', () => {
  it('admins get Usage and the App Store; members only when the policy (and, for Usage, their switch) allow', async () => {
    const d = await daemonWithAdmin(closers);
    const db = d.services!.db;
    const me = async () => (await d.query('auth.me')).result!.data as { canSeeUsage: boolean; canInstallApps: boolean };
    expect(await me()).toMatchObject({ canSeeUsage: true, canInstallApps: true });

    db.update(users).set({ role: 'member' }).where(eq(users.id, d.userId)).run();
    const people = { showUserList: true, requireTotp: false, membersCanInstall: false, membersCanSeeUsage: false };
    expect(await me()).toMatchObject({ canSeeUsage: false, canInstallApps: false });
    setSetting(db, 'people', { ...people, membersCanSeeUsage: true, membersCanInstall: true });
    expect(await me()).toMatchObject({ canSeeUsage: false, canInstallApps: true });
    db.update(users).set({ canSeeUsage: true }).where(eq(users.id, d.userId)).run();
    expect(await me()).toMatchObject({ canSeeUsage: true, canInstallApps: true });
  });
});
