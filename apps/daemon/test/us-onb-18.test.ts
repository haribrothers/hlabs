// US-ONB-18 · Set up remote access later (server side): from the remote step, setStep moves on to apps, and nothing
// about remote access is configured.
import { getSetting, setSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ONB-18', () => {
  it('Set up later: remote → apps, remote access stays off', async () => {
    const d = await daemonWithAdmin(closers, { phase: 3 });
    const { db } = d.services!;
    setSetting(db, 'onboarding', { ...getSetting(db, 'onboarding'), step: 'remote' });
    expect((await d.mutate('onboarding.setStep', { step: 'apps' })).result?.data).toEqual({ ok: true });
    expect(getSetting(db, 'onboarding').step).toBe('apps');
    expect(getSetting(db, 'remote')).toEqual({ state: 'off', tailnetName: null });
  });

  it('can only move to the next step, not past apps', async () => {
    const d = await daemonWithAdmin(closers, { phase: 3 });
    const { db } = d.services!;
    setSetting(db, 'onboarding', { ...getSetting(db, 'onboarding'), step: 'remote' });
    expect((await d.mutate('onboarding.setStep', { step: 'done' })).error?.data.hlabsCode).toBe(
      'ONBOARDING_STEP_INVALID',
    );
  });
});
