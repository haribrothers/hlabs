// US-AUTH-02 · Log in as another user or with the list hidden (server side).
import { setSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { startDaemon } from './helpers';
import { users } from '@hlabs/db';
import { ulid } from '@hlabs/shared';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-AUTH-02', () => {
  it('the list is empty when an admin hides it, whoever asks: the server enforces it', async () => {
    const d = await startDaemon({ config: { devAnonymousAdmin: false }, boot: { print: () => {} } });
    closers.push(d.close);
    d.services!.db.insert(users)
      .values({
        id: ulid(),
        username: 'hari',
        displayName: 'Hari',
        role: 'admin',
        passwordHash: 'x',
        createdAt: Date.now(),
      })
      .run();
    const list = async () =>
      ((await (await fetch(`${d.url}/trpc/auth.listLoginUsers`)).json()) as { result: { data: { users: unknown[] } } })
        .result.data.users;
    expect(await list()).toHaveLength(1);
    setSetting(d.services!.db, 'people', { showUserList: false });
    expect(await list()).toEqual([]);
  });
});
