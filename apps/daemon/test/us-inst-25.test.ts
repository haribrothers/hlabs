// US-INST-25 · Manage a headless install from the command line: tray.appLogs gives one app's container logs to
// `hlabs logs --app` (the tray token may call tray.* only, D-035), and a reset from `hlabs reset-password` is recorded
// as coming from the command line.
import { apps, auditLog, openDb, passwordResets, users } from '@hlabs/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/auth/passwords';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { trayAppLogs } from '../src/tray/app-logs';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();

describe('US-INST-25', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  it("gives an app's recent logs, and says when there's no such app", async () => {
    const db = openDb({ file: ':memory:' });
    db.insert(apps)
      .values({
        id: 'immich',
        sourceId: null,
        version: '1.0.0',
        state: 'running',
        hostname: 'immich',
        portFallback: 12000,
        authMode: 'hlabs',
        installedAt: 1,
        updatedAt: 1,
      })
      .run();
    const line = { service: 'server', stream: 'stdout' as const, ts: 5, line: 'ready' };
    const recent = vi.fn(async () => [line]);
    expect(await trayAppLogs({ db, logs: { recent } }, { appId: 'immich', since: 4 })).toEqual({ lines: [line] });
    expect(recent).toHaveBeenCalledWith('immich', { tail: 200, since: 4 });
    await expect(trayAppLogs({ db, logs: { recent } }, { appId: 'jellyfin' })).rejects.toMatchObject({
      cause: { hlabsCode: 'NOT_FOUND' },
    });
  });

  it('a reset from the command line is recorded as via cli', async () => {
    const d = await startDaemon({
      config: { devAnonymousAdmin: false },
      boot: { print: () => {} },
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
    });
    close = d.close;
    const { db } = d.services!;
    db.insert(users)
      .values({
        id: 'u1',
        username: 'asha',
        displayName: 'Asha',
        role: 'member',
        passwordHash: await hashPassword('old password here'),
        createdAt: 1,
      })
      .run();
    const res = await fetch(`${d.url}/trpc/tray.resetPassword`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'asha', newPassword: 'violet harbour lantern', disableTotp: false, via: 'cli' }),
    });
    expect(res.status).toBe(200);
    expect(db.select().from(passwordResets).get()).toMatchObject({ userId: 'u1', createdVia: 'tray' });
    expect(
      db
        .select()
        .from(auditLog)
        .all()
        .find((r) => r.action === 'user.passwordReset'),
    ).toMatchObject({ target: 'u1', detailJson: { via: 'cli', totpDisabled: false } });
  });
});
