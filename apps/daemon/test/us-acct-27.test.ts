// US-ACCT-27 · Member sees a limited Settings (server side): who manages hlabs, and search without admin settings.
import { users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-27', () => {
  it('the note names the earliest-created enabled admin', async () => {
    const d = await daemonWithAdmin(closers);
    const { db } = d.services!;
    const anu = await memberSession(d);
    const adminName = async () => (await anu.query('account.get')).result!.data.adminName;
    // A second admin, made later.
    db.insert(users)
      .values({
        id: ulid(),
        username: 'mia',
        displayName: 'Mia',
        role: 'admin',
        passwordHash: 'x',
        createdAt: Date.now() + 1,
      })
      .run();
    expect(await adminName()).toBe('Hari');
    db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, d.userId)).run();
    expect(await adminName()).toBe('Mia');
  });

  it("a member's search returns no admin-only settings", async () => {
    const d = await daemonWithAdmin(closers);
    const anu = await memberSession(d);
    const settings = async (query: string, who = anu.query) =>
      ((await who('home.searchEverything', { query })).result!.data.settings as Array<{ section: string }>).map(
        (s) => s.section,
      );
    expect(await settings('engine')).toEqual([]);
    expect(await settings('users')).toEqual([]);
    expect(await settings('password')).toEqual(['account']);
    const admin = async (path: string, input: unknown) =>
      d.query(`${path}?input=${encodeURIComponent(JSON.stringify(input))}`);
    expect(await settings('engine', admin as never)).toEqual(['engine']);
  });
});
