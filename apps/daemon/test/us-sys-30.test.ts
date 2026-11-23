// US-SYS-30 · Opt in to beta updates (server side): settings.updates.setChannel switches the channel, forgets what the
// other channel offered and checks the new one at once; audited; admins only. Back on stable from a beta build, hlabs
// stays on it until a stable version newer than it is out; updates.get says which channel it's on.
import { auditLog, getSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { FakeUpdateSource } from './fakes/update-source';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

async function setup(version: string) {
  const source = new FakeUpdateSource();
  const d = await daemonWithAdmin(closers, { version }, { updateSource: source });
  const status = async () =>
    (await d.query('settings.updates.get')).result!.data as { channel: string; available: { version: string } | null };
  /** The background check the switch started has run. */
  const checked = async (count: number) => {
    for (let i = 0; i < 100 && source.calls.length < count; i++) await new Promise((r) => setTimeout(r, 10));
    await d.services!.hlabsUpdates.check();
  };
  return { d, source, status, checked };
}

describe('US-SYS-30', () => {
  it('turning Beta on makes the channel beta and checks the beta manifest at once', async () => {
    const { d, source, status, checked } = await setup('1.4.0');
    source.releases.beta = { version: '1.5.0-beta.1' };
    expect((await d.mutate('settings.updates.setChannel', { channel: 'beta' })).result!.data).toEqual({ ok: true });
    await checked(1);
    expect(source.calls[0]).toBe('beta');
    expect(await status()).toMatchObject({ channel: 'beta', available: { version: '1.5.0-beta.1' } });
    expect(getSetting(d.services!.db, 'updates').channel).toBe('beta');
    expect(
      d
        .services!.db.select()
        .from(auditLog)
        .all()
        .find((a) => a.action === 'settings.updates.channel'),
    ).toMatchObject({
      userId: d.userId,
      detailJson: { channel: 'beta' },
    });
  });

  it('turning it off on a beta build stays on that build until a newer stable version is out', async () => {
    const { d, source, status, checked } = await setup('1.5.0-beta.2');
    await d.mutate('settings.updates.setChannel', { channel: 'beta' });
    source.releases.beta = { version: '1.5.0-beta.3' };
    await checked(1);
    expect((await status()).available?.version).toBe('1.5.0-beta.3');

    source.releases.stable = { version: '1.4.2' };
    await d.mutate('settings.updates.setChannel', { channel: 'stable' });
    await checked(3);
    // The beta offered before is forgotten, and an older stable isn't offered.
    expect(await status()).toMatchObject({ channel: 'stable', available: null });
    source.releases.stable = { version: '1.5.0' };
    await d.services!.hlabsUpdates.check();
    expect((await status()).available?.version).toBe('1.5.0');
  });

  it('members are refused', async () => {
    const { d } = await setup('1.4.0');
    const anu = await memberSession(d);
    expect((await anu.mutate('settings.updates.setChannel', { channel: 'beta' })).error?.data.hlabsCode).toBe(
      'ACCESS_DENIED',
    );
    expect(getSetting(d.services!.db, 'updates').channel).toBe('stable');
  });
});
