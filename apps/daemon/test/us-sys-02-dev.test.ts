// US-SYS-02 · Connect with Tailscale, in development: under `pnpm dev` the pretend Tailscale's "Connect" opens its own
// log-in page, served by the daemon, where Approve signs this computer in (never Tailscale's real site, a 404 there).
import { afterEach, describe, expect, it } from 'vitest';
import { FakeTailscale } from '../src/tailscale/fake';
import { daemonWithAdmin } from './admin-session';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe('US-SYS-02', () => {
  it("in development, Connect opens the pretend Tailscale's page, and Approve connects", async () => {
    const d = await daemonWithAdmin(closers);
    const fake = d.services!.tailscale as FakeTailscale;
    expect(fake).toBeInstanceOf(FakeTailscale);

    // Nothing waiting yet: the page says to start in hlabs.
    let page = await fetch(`${d.url}${FakeTailscale.DEV_SIGN_IN_PATH}`);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await page.text()).toContain('Nothing is waiting');

    const started = (await d.mutate('network.remote.connect', {})).result!.data;
    expect(started).toEqual({ state: 'needs_login', loginUrl: '/dev/tailscale/sign-in' });
    expect((await d.services!.remote.status()).state).toBe('waiting');

    page = await fetch(`${d.url}${FakeTailscale.DEV_SIGN_IN_PATH}`);
    const html = await page.text();
    expect(html).toContain('Add this device to your tailnet?');
    expect(html).toContain('Pretend Tailscale');
    expect(html).toContain('enctype="text/plain"');

    // As the page's form sends it from the dashboard's address.
    const approved = await fetch(`${d.url}${FakeTailscale.DEV_SIGN_IN_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://hlabs.local' },
      body: '',
    });
    expect(approved.status).toBe(200);
    expect(await approved.text()).toContain('Approved');
    expect(fake.signingIn).toBe(false);
    const status = await d.services!.remote.status();
    expect(status).toMatchObject({ state: 'connected', tailnet: 'tail1234.ts.net' });
  });
});
