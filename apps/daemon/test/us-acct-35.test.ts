// US-ACCT-35 · Reduce transparency and motion (server side): saved per account; Reduce motion is null until the
// person sets it, so the device's own setting decides until then.
import { getUserSetting, setUserSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Me = { appearance: { reduceTransparency: boolean; reduceMotion: boolean | null } };

describe('US-ACCT-35', () => {
  it('Reduce transparency is off and Reduce motion never set by default; both are saved when changed', async () => {
    const d = await daemonWithAdmin(closers);
    const look = async () => {
      const { reduceTransparency, reduceMotion } = ((await d.query('auth.me')).result!.data as Me).appearance;
      return { reduceTransparency, reduceMotion };
    };
    expect(await look()).toEqual({ reduceTransparency: false, reduceMotion: null });
    await d.mutate('settings.appearance.update', { reduceTransparency: true });
    expect(await look()).toEqual({ reduceTransparency: true, reduceMotion: null });
    // Turned off is a choice too, and stays one.
    await d.mutate('settings.appearance.update', { reduceMotion: false });
    expect(await look()).toEqual({ reduceTransparency: true, reduceMotion: false });
    await d.mutate('settings.appearance.update', { reduceMotion: true });
    expect(await look()).toEqual({ reduceTransparency: true, reduceMotion: true });
  });

  it('only true or false can be saved: "never set" is not something to choose', async () => {
    const d = await daemonWithAdmin(closers);
    expect((await d.mutate('settings.appearance.update', { reduceMotion: null })).error?.data.hlabsCode).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('a saved appearance from before Reduce motion existed reads as never set', async () => {
    const d = await daemonWithAdmin(closers);
    const db = d.services!.db;
    setUserSetting(db, 'appearance', d.userId, { accent: 'rose' });
    expect(getUserSetting(db, 'appearance', d.userId)).toMatchObject({ accent: 'rose', reduceMotion: null });
  });
});
