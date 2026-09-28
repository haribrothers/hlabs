// US-ONB-22 · Finish onboarding and open the dashboard (server side).
import { auditLog, getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { SETUP_TOKEN_REF } from '../src/onboarding/service';
import { FileSecretStore } from '../src/platform/secrets';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ONB-22', () => {
  it('without a storage location, complete says which step is missing and changes nothing', async () => {
    const d = await daemonWithAdmin(closers);
    const res = await d.mutate('onboarding.complete');
    expect(res.error?.data).toMatchObject({ hlabsCode: 'ONBOARDING_INCOMPLETE', detail: { missing: 'storage' } });
    expect(getSetting(d.services!.db, 'onboarding').completedAt).toBeNull();
  });

  it('completing sets completedAt and step done, retires the setup token and audits it; the admin stays signed in', async () => {
    const d = await daemonWithAdmin(closers);
    await d.mutate('onboarding.setStep', { step: 'storage' });
    await d.mutate('onboarding.setStorage', { kind: 'local' });
    expect((await d.mutate('onboarding.complete')).result?.data).toEqual({ redirectTo: '/' });

    const db = d.services!.db;
    const onboarding = getSetting(db, 'onboarding');
    expect(onboarding).toMatchObject({ step: 'done', setupTokenRef: null });
    expect(onboarding.completedAt).toBeGreaterThan(0);
    expect(await new FileSecretStore(d.config.paths.dataDir).get(SETUP_TOKEN_REF)).toBeNull();
    expect(d.services!.onboarding.verifySetupToken(d.token)).toBe(false);
    expect(db.select().from(auditLog).all()).toContainEqual(
      expect.objectContaining({ action: 'onboarding.complete', userId: d.userId }),
    );
    expect((await d.query('auth.me')).result?.data).toMatchObject({ username: 'hari' });
    // And setup is closed for good.
    expect((await d.mutate('onboarding.complete')).error?.data.hlabsCode).toBe('ONBOARDING_COMPLETE');
  });
});
