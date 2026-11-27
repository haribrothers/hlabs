// US-ACCT-34 · Home screen options (server side): Show widgets and Show greeting, on by default, saved per account.
import { afterEach, describe, expect, it } from 'vitest';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

type Me = { appearance: { showWidgets: boolean; showGreeting: boolean } };

describe('US-ACCT-34', () => {
  it('both on by default, and each switch is saved on its own', async () => {
    const d = await daemonWithAdmin(closers);
    const home = async () => {
      const { showWidgets, showGreeting } = ((await d.query('auth.me')).result!.data as Me).appearance;
      return { showWidgets, showGreeting };
    };
    expect(await home()).toEqual({ showWidgets: true, showGreeting: true });
    await d.mutate('settings.appearance.update', { showWidgets: false });
    expect(await home()).toEqual({ showWidgets: false, showGreeting: true });
    await d.mutate('settings.appearance.update', { showGreeting: false });
    expect(await home()).toEqual({ showWidgets: false, showGreeting: false });
  });

  it('a member changes only their own Home', async () => {
    const d = await daemonWithAdmin(closers);
    const anu = await memberSession(d);
    await anu.mutate('settings.appearance.update', { showWidgets: false });
    expect(((await anu.query('auth.me')).result!.data as Me).appearance.showWidgets).toBe(false);
    expect(((await d.query('auth.me')).result!.data as Me).appearance.showWidgets).toBe(true);
  });
});
