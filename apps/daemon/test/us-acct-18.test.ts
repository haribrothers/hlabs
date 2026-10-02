// US-ACCT-18 · Choose what the log-in screen shows (server side).
import { auditLog, users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-18', () => {
  it('the list of users is on by default; off, auth.listLoginUsers is empty; on, it lists enabled users', async () => {
    const d = await daemonWithAdmin(closers);
    d.services!.db.insert(users)
      .values({
        id: ulid(),
        username: 'ravi',
        displayName: 'Ravi',
        role: 'member',
        passwordHash: 'x',
        createdAt: 2,
        disabledAt: 3,
      })
      .run();
    const listed = async () =>
      (
        (await (await fetch(`${d.url}/trpc/auth.listLoginUsers`)).json()) as {
          result: { data: { users: Array<{ username: string }> } };
        }
      ).result.data.users.map((u) => u.username);
    expect((await d.query('users.getPolicy')).result!.data).toEqual({
      showUserList: true,
      requireTotp: false,
      membersCanInstall: false,
      membersCanSeeUsage: false,
    });
    expect(await listed()).toEqual(['hari']);

    expect((await d.mutate('users.updatePolicy', { showUserList: false })).result!.data).toMatchObject({
      showUserList: false,
    });
    expect(await listed()).toEqual([]);
    expect(
      d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'users.updatePolicy')).get()?.detailJson,
    ).toEqual({
      showUserList: false,
    });
    await d.mutate('users.updatePolicy', { showUserList: true });
    expect(await listed()).toEqual(['hari']);
  });
});
