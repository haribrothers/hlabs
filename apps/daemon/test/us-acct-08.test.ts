// US-ACCT-08 · See my two-factor and recovery code status (server side).
import { recoveryCodes } from '@hlabs/db';
import { eq } from 'drizzle-orm';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Account = {
  totpEnabledAt: number | null;
  recoveryCodesUnused: number;
  recoveryCodesUsed: boolean[];
  totpAddedDuringSetup: boolean;
  totpRequired: boolean;
  hostname: string;
};

describe('US-ACCT-08', () => {
  it('reports two-factor off, then on during setup with 10 codes, and which ones were used', async () => {
    const d = await daemonWithAdmin(closers);
    const get = async () => (await d.query('account.get')).result!.data as Account;
    expect(await get()).toMatchObject({
      totpEnabledAt: null,
      recoveryCodesUnused: 0,
      recoveryCodesUsed: [],
      hostname: 'hlabs',
      totpRequired: false,
    });

    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) });
    const on = await get();
    expect(on.totpEnabledAt).toBeGreaterThan(0);
    expect(on.totpAddedDuringSetup).toBe(true);
    expect(on.recoveryCodesUnused).toBe(10);
    expect(on.recoveryCodesUsed).toEqual(Array(10).fill(false));

    const [first] = d.services!.db.select().from(recoveryCodes).orderBy(recoveryCodes.id).all();
    d.services!.db.update(recoveryCodes).set({ usedAt: Date.now() }).where(eq(recoveryCodes.id, first!.id)).run();
    const used = await get();
    expect(used.recoveryCodesUnused).toBe(9);
    expect(used.recoveryCodesUsed[0]).toBe(true);
  });
});
