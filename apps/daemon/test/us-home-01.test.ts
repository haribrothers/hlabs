// US-HOME-01 · See a greeting over my wallpaper (server side): auth.me carries the person's appearance.
import { setUserSetting } from '@hlabs/db';
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-HOME-01', () => {
  it('auth.me returns the defaults (Dusk, Violet), then what the person saved', async () => {
    const d = await daemonWithAdmin(closers);
    const appearance = async () => ((await d.query('auth.me')).result!.data as { appearance: unknown }).appearance;
    expect(await appearance()).toEqual({
      wallpaper: 'dusk',
      accent: 'violet',
      reduceTransparency: false,
      reduceMotion: false,
      showWidgets: true,
      showGreeting: true,
    });
    setUserSetting(d.services!.db, 'appearance', d.userId, { accent: 'mint' });
    expect(await appearance()).toMatchObject({ wallpaper: 'dusk', accent: 'mint' });
  });
});
