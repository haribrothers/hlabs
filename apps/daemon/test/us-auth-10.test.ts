// US-AUTH-10 · Set up two-factor when an admin requires it (server side). The policy switch ships in phase 3
// (US-ACCT-19); the setting is set directly here.
import { setSetting } from '@hlabs/db';
import { generateSync } from 'otplib';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-AUTH-10', () => {
  it('auth.me says to set up two-factor only when it is required and not set up yet', async () => {
    const d = await daemonWithAdmin(closers);
    const me = async () => (await d.query('auth.me')).result!.data as { mustSetupTotp: boolean };
    expect((await me()).mustSetupTotp).toBe(false);

    setSetting(d.services!.db, 'people', {
      ...{ showUserList: true, membersCanInstall: false, membersCanSeeUsage: false },
      requireTotp: true,
    });
    expect((await me()).mustSetupTotp).toBe(true);

    // Admins are held to the same rule; setting two-factor up clears it.
    const { secret } = (await d.mutate('onboarding.setupTotp')).result!.data as { secret: string };
    await d.mutate('onboarding.confirmTotp', { code: generateSync({ secret }) });
    expect((await me()).mustSetupTotp).toBe(false);
  });
});
