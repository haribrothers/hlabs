// US-ACCT-33 · Choose an accent colour (server side): saved per account and returned by auth.me on every device.
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-ACCT-33', () => {
  it('Violet by default; Mint, Amber and Rose are saved and come back in auth.me', async () => {
    const d = await daemonWithAdmin(closers);
    const accent = async () =>
      ((await d.query('auth.me')).result!.data as { appearance: { accent: string } }).appearance.accent;
    expect(await accent()).toBe('violet');
    for (const next of ['mint', 'amber', 'rose', 'violet']) {
      expect((await d.mutate('settings.appearance.update', { accent: next })).result?.data).toEqual({ ok: true });
      expect(await accent()).toBe(next);
    }
  });

  it('refuses a colour that is not one of the four (D-023: no Sky)', async () => {
    const d = await daemonWithAdmin(closers);
    expect((await d.mutate('settings.appearance.update', { accent: 'sky' })).error?.data.hlabsCode).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('changing the accent leaves the rest of the look as it was', async () => {
    const d = await daemonWithAdmin(closers);
    await d.mutate('settings.appearance.update', { wallpaper: 'ocean', showWidgets: false });
    await d.mutate('settings.appearance.update', { accent: 'amber' });
    expect(((await d.query('auth.me')).result!.data as { appearance: unknown }).appearance).toMatchObject({
      wallpaper: 'ocean',
      accent: 'amber',
      showWidgets: false,
    });
  });
});
