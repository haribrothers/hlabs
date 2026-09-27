// US-ONB-12 · Save recovery codes (server side).
import { getSetting, recoveryCodes } from '@hlabs/db';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ONB-12', () => {
  it('Continue saves step storage; only hashes of the codes are kept; auth.me says two-factor is on', async () => {
    const d = await daemonWithAdmin(closers);
    expect((await d.query('auth.me')).result?.data.totpEnabled).toBe(false);
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    const { recoveryCodes: codes } = (await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) }))
      .result!.data as { recoveryCodes: string[] };

    // After a reload the dashboard knows two-factor is on without seeing the codes again.
    expect((await d.query('auth.me')).result?.data.totpEnabled).toBe(true);
    const stored = d.services!.db.select().from(recoveryCodes).all();
    for (const row of stored) expect(codes).not.toContain(row.codeHash);

    expect((await d.mutate('onboarding.setStep', { step: 'storage' })).result?.data).toEqual({ ok: true });
    expect(getSetting(d.services!.db, 'onboarding').step).toBe('storage');
  });
});
