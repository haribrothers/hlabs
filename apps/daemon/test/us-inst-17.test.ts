// US-INST-17 · Choose an account and a new password: tray.listUsers lists every enabled account, admins first, then
// by name, with whether two-factor is on.
import { users, userTotp } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();

function user(
  id: string,
  username: string,
  displayName: string,
  role: 'admin' | 'member',
  disabledAt: number | null = null,
) {
  return { id, username, displayName, role, passwordHash: 'x', createdAt: 1, disabledAt };
}

describe('US-INST-17 · Choose an account and a new password', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  it('lists enabled accounts, admins first then alphabetical, with two-factor', async () => {
    const d = await startDaemon({
      config: { devAnonymousAdmin: false },
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
    });
    close = d.close;
    const { db } = d.services!;
    db.insert(users)
      .values([
        user('u1', 'zoe', 'Zoe', 'member'),
        user('u2', 'hari', 'Hari', 'admin'),
        user('u3', 'asha', 'Asha', 'member'),
        user('u4', 'old', 'Old', 'member', 5),
        user('u5', 'bea', 'Bea', 'admin'),
      ])
      .run();
    db.insert(userTotp)
      .values([
        { userId: 'u2', secretRef: 'totp:u2', enabledAt: 10 },
        // Started setting it up, never finished: not on.
        { userId: 'u3', secretRef: 'totp:u3', enabledAt: null },
      ])
      .run();

    const res = await fetch(`${d.url}/trpc/tray.listUsers`, { headers: { authorization: `Bearer ${TOKEN}` } });
    const body = (await res.json()) as { result: { data: { users: Array<Record<string, unknown>> } } };
    expect(body.result.data.users).toEqual([
      { id: 'u5', username: 'bea', displayName: 'Bea', role: 'admin', totpEnabled: false },
      { id: 'u2', username: 'hari', displayName: 'Hari', role: 'admin', totpEnabled: true },
      { id: 'u3', username: 'asha', displayName: 'Asha', role: 'member', totpEnabled: false },
      { id: 'u1', username: 'zoe', displayName: 'Zoe', role: 'member', totpEnabled: false },
    ]);
  });

  it('is only for the tray', async () => {
    const d = await startDaemon({
      config: { devAnonymousAdmin: false },
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
    });
    close = d.close;
    expect((await fetch(`${d.url}/trpc/tray.listUsers`)).status).toBe(401);
  });
});
