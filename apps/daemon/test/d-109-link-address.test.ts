// D-109 · Invite and reset-password links use the tailnet address while remote access is on (US-ACCT-21, US-ACCT-14).
import { afterEach, describe, expect, it } from 'vitest';
import type { FakeTailscale } from '../src/tailscale/fake';
import { daemonWithAdmin } from './admin-session';
import { memberSession } from './member-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('D-109', () => {
  it('home network only: the hlabs.local link, no home copy', async () => {
    const d = await daemonWithAdmin(closers);
    const made = (await d.mutate('invites.create', { role: 'member' })).result!.data;
    expect(made.url).toMatch(/^https:\/\/hlabs\.local\/invite\//);
    expect(made.homeUrl).toBeNull();
  });

  it('remote access on: the tailnet link, with the home-network one as homeUrl, for invites and reset links', async () => {
    const d = await daemonWithAdmin(closers);
    const anu = await memberSession(d);
    const ts = d.services!.tailscale as FakeTailscale;
    ts.current = {
      kind: 'running',
      tailnet: 'tail9.ts.net',
      nodeName: 'hari-home',
      httpsEnabled: true,
      keyExpiry: null,
    };
    await d.mutate('network.remote.connect', { confirmTailnet: true });

    const made = (await d.mutate('invites.create', { role: 'member' })).result!.data as {
      url: string;
      homeUrl: string;
    };
    const token = made.url.split('/invite/')[1];
    expect(made.url).toBe(`https://hari-home.tail9.ts.net/invite/${token}`);
    expect(made.homeUrl).toBe(`https://hlabs.local/invite/${token}`);
    const listed = (await d.query('invites.list')).result!.data.invites as Array<{ url: string; homeUrl: string }>;
    expect(listed[0]).toMatchObject({ url: made.url, homeUrl: made.homeUrl });

    const reset = (await d.mutate('users.resetPasswordLink', { userId: anu.userId })).result!.data as {
      url: string;
      homeUrl: string;
    };
    expect(reset.url).toMatch(/^https:\/\/hari-home\.tail9\.ts\.net\/reset\//);
    expect(reset.homeUrl).toMatch(/^https:\/\/hlabs\.local\/reset\//);
  });
});
