// US-ONB-13 · Skip two-factor for now (server side).
import { getSetting, userTotp } from '@hlabs/db';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ONB-13', () => {
  it('skipping saves step storage, leaves two-factor off and discards the pending secret', async () => {
    const d = await daemonWithAdmin(closers);
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    expect((await d.mutate('onboarding.setStep', { step: 'storage' })).result?.data).toEqual({ ok: true });

    const db = d.services!.db;
    expect(getSetting(db, 'onboarding').step).toBe('storage');
    expect(db.select().from(userTotp).all()).toEqual([]);
    expect((await d.query('auth.me')).result?.data.totpEnabled).toBe(false);
    // The secret that was shown can't be confirmed any more.
    expect(d.services!.totp.isEnabled(d.userId)).toBe(false);
    await expect(d.services!.totp.confirm(d.userId, generateSync({ secret }), { ip: null })).rejects.toThrow(
      /Start two-factor setup first/,
    );
  });
});
