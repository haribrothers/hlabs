// US-ACCT-03 · See and edit my profile (server side).
import { auditLog, users } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-03', () => {
  it('account.get returns my profile and account facts', async () => {
    const d = await daemonWithAdmin(closers);
    expect((await d.query('account.get')).result!.data).toMatchObject({
      username: 'hari',
      displayName: 'Hari',
      role: 'admin',
      locale: 'en',
      totpEnabledAt: null,
      recoveryCodesUnused: 0,
      homeFolderBytes: null,
      adminName: 'Hari',
    });
  });

  it('account.update trims the name, saves colour and language, and is audited', async () => {
    const d = await daemonWithAdmin(closers);
    const r = await d.mutate('account.update', { displayName: '  Hari P ', avatarColor: 'rose', locale: 'en' });
    expect(r.result?.data).toEqual({ ok: true });
    const row = d.services!.db.select().from(users).where(eq(users.id, d.userId)).get()!;
    expect(row).toMatchObject({ displayName: 'Hari P', avatarColor: 'rose', locale: 'en' });
    expect(d.services!.db.select().from(auditLog).where(eq(auditLog.action, 'account.update')).all()).toHaveLength(1);
    expect(((await d.query('auth.me')).result!.data as { displayName: string }).displayName).toBe('Hari P');
  });

  it('refuses an empty or too-long name, and unknown colours', async () => {
    const d = await daemonWithAdmin(closers);
    for (const input of [{ displayName: '   ' }, { displayName: 'x'.repeat(41) }, { avatarColor: 'teal' }]) {
      expect((await d.mutate('account.update', input)).error?.data.hlabsCode).toBe('VALIDATION_FAILED');
    }
  });
});
