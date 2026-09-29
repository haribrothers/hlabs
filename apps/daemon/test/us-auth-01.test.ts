// US-AUTH-01 · Pick my account from the user list (server side).
import { users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon } from './helpers';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function withUsers() {
  const d = await startDaemon({ config: { devAnonymousAdmin: false }, boot: { print: () => {} } });
  closers.push(d.close);
  const add = (username: string, displayName: string, role: 'admin' | 'member', disabled = false) =>
    d
      .services!.db.insert(users)
      .values({
        id: ulid(),
        username,
        displayName,
        role,
        passwordHash: 'x',
        avatarColor: role === 'admin' ? 'violet' : null,
        createdAt: Date.now(),
        disabledAt: disabled ? Date.now() : null,
      })
      .run();
  add('zoe', 'Zoe', 'member');
  add('hari', 'Hari', 'admin');
  add('anu', 'Anu', 'member');
  add('old', 'Old Account', 'member', true);
  add('bea', 'Bea', 'admin');
  const list = async () =>
    ((await (await fetch(`${d.url}/trpc/auth.listLoginUsers`)).json()) as { result: { data: { users: unknown[] } } })
      .result.data.users;
  return { ...d, list };
}

describe('US-AUTH-01', () => {
  it('lists enabled users, admins first, each group by display name, with only what the list needs', async () => {
    const d = await withUsers();
    const list = (await d.list()) as Array<Record<string, unknown>>;
    expect(list.map((u) => [u.displayName, u.role])).toEqual([
      ['Bea', 'admin'],
      ['Hari', 'admin'],
      ['Anu', 'member'],
      ['Zoe', 'member'],
    ]);
    expect(Object.keys(list[0]!).sort()).toEqual(['avatarColor', 'displayName', 'id', 'role', 'username']);
  });
});
