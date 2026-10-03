// US-INST-18 · Confirm with the OS and apply the reset: after the Mac's login confirms (the tray's side), the daemon
// sets the new password, signs the person out everywhere, clears their lockouts, can turn two-factor off, and records it.
import { auditLog, loginAttempts, passwordResets, recoveryCodes, users, userTotp } from '@hlabs/db';
import { ulid } from '@hlabs/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { newTrayToken, TrayTokens } from '../src/auth/tray-token';
import { hashPassword, verifyPassword } from '../src/auth/passwords';
import { trayResetPassword } from '../src/tray/reset-password';
import { startDaemon } from './helpers';

const TOKEN = newTrayToken();
const NEW = 'violet harbour lantern';

describe('US-INST-18 · Confirm with the OS and apply the reset', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  async function withAsha(opts: { totp?: boolean; disabled?: boolean } = {}) {
    const d = await startDaemon({
      config: { devAnonymousAdmin: false },
      boot: { print: () => {} },
      trayTokens: new TrayTokens({ read: async () => TOKEN }),
    });
    close = d.close;
    const s = d.services!;
    s.db
      .insert(users)
      .values({
        id: 'u1',
        username: 'asha',
        displayName: 'Asha',
        role: 'member',
        passwordHash: await hashPassword('old password here'),
        createdAt: 1,
        disabledAt: opts.disabled ? 2 : null,
      })
      .run();
    if (opts.totp) {
      s.db.insert(userTotp).values({ userId: 'u1', secretRef: 'totp:u1', enabledAt: 5 }).run();
      s.db.insert(recoveryCodes).values({ id: ulid(), userId: 'u1', codeHash: 'h' }).run();
    }
    // Locked out after wrong passwords.
    for (let i = 0; i < 5; i++) {
      s.db
        .insert(loginAttempts)
        .values({ id: ulid(), username: 'asha', ip: '1.2.3.4', at: Date.now(), success: false })
        .run();
    }
    return { d, s };
  }

  it('sets the new password, signs them out everywhere, clears lockouts and records it', async () => {
    const { s } = await withAsha();
    const session = s.sessions.create({ userId: 'u1', remember: false, ip: null, userAgent: null });
    await trayResetPassword(s, { username: 'asha', newPassword: NEW, disableTotp: false });

    const user = s.db.select().from(users).where(eq(users.id, 'u1')).get()!;
    expect(await verifyPassword(user.passwordHash, NEW)).toBe(true);
    expect(s.sessions.resolve(session.raw)).toBeNull();
    expect(s.db.select().from(loginAttempts).where(eq(loginAttempts.username, 'asha')).all()).toEqual([]);
    expect(s.db.select().from(passwordResets).all()).toEqual([
      expect.objectContaining({ userId: 'u1', createdVia: 'tray', tokenHash: null, usedAt: expect.any(Number) }),
    ]);
    const audit = s.db
      .select()
      .from(auditLog)
      .all()
      .find((r) => r.action === 'user.passwordReset');
    expect(audit).toMatchObject({ userId: null, target: 'u1', detailJson: { via: 'tray', totpDisabled: false } });
  });

  it('turns two-factor off when asked: the two-factor row and recovery codes go', async () => {
    const { s } = await withAsha({ totp: true });
    await trayResetPassword(s, { username: 'asha', newPassword: NEW, disableTotp: true });
    expect(s.db.select().from(userTotp).all()).toEqual([]);
    expect(s.db.select().from(recoveryCodes).all()).toEqual([]);
    const audit = s.db
      .select()
      .from(auditLog)
      .all()
      .find((r) => r.action === 'user.passwordReset');
    expect(audit?.detailJson).toEqual({ via: 'tray', totpDisabled: true });
  });

  it('keeps two-factor when not asked', async () => {
    const { s } = await withAsha({ totp: true });
    await trayResetPassword(s, { username: 'asha', newPassword: NEW, disableTotp: false });
    expect(s.db.select().from(userTotp).all()).toHaveLength(1);
  });

  it('an account deleted or disabled since the window opened is NOT_FOUND, and nothing changes', async () => {
    const { s, d } = await withAsha({ disabled: true });
    const res = await fetch(`${d.url}/trpc/tray.resetPassword`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'asha', newPassword: NEW, disableTotp: false }),
    });
    expect(((await res.json()) as { error: { data: { hlabsCode: string } } }).error.data.hlabsCode).toBe('NOT_FOUND');
    expect(s.db.select().from(passwordResets).all()).toEqual([]);
  });

  it('refuses a password that breaks the rules', async () => {
    const { s } = await withAsha();
    await expect(
      trayResetPassword(s, { username: 'asha', newPassword: 'short', disableTotp: false }),
    ).rejects.toThrow();
    await expect(
      trayResetPassword(s, { username: 'asha', newPassword: 'password1234', disableTotp: false }),
    ).rejects.toThrow();
  });
});
