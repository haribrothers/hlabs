// US-ONB-17 · Connect Tailscale for remote access (server side): onboarding.connectRemote during setup, with the
// admin's session, the same flow as Settings.
import { getSetting, setSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import type { FakeTailscale } from '../src/tailscale/fake';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ONB-17', () => {
  it('connects from the remote step: the log-in names the computer after the server, then it publishes', async () => {
    const d = await daemonWithAdmin(closers, { phase: 3 });
    const { db } = d.services!;
    setSetting(db, 'onboarding', { ...getSetting(db, 'onboarding'), step: 'remote' });
    const ts = d.services!.tailscale as FakeTailscale;
    expect((await d.mutate('onboarding.connectRemote', {})).result?.data).toMatchObject({ state: 'needs_login' });
    expect(ts.hostname).toBe('hlabs');
    ts.finishLogin('tail1234.ts.net');
    expect((await d.query('network.status')).result!.data.remote).toMatchObject({
      state: 'connected',
      url: 'https://hlabs.tail1234.ts.net',
    });
    // Never Funnel.
    expect(ts.config.AllowFunnel).toBeUndefined();
  });

  it('after setup it is refused (Settings has its own Connect)', async () => {
    const d = await daemonWithAdmin(closers, { phase: 3 });
    const { db } = d.services!;
    setSetting(db, 'onboarding', { ...getSetting(db, 'onboarding'), completedAt: Date.now() });
    expect((await d.mutate('onboarding.connectRemote', {})).error?.data.hlabsCode).toBe('ONBOARDING_COMPLETE');
  });
});
