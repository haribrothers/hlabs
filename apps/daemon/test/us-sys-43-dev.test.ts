// US-SYS-43 · Set up a way to make apps public, in development: under `pnpm dev` the pretend Cloudflare's "Sign in to
// Cloudflare" opens its own page, served by the daemon, where Approve finishes the sign-in (never a blank page).
import { afterEach, describe, expect, it } from 'vitest';
import { FakeCloudflare } from '../src/cloudflare/fake';
import { startDaemon } from './helpers';

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

describe('US-SYS-43', () => {
  it('in development, "Sign in to Cloudflare" opens the pretend Cloudflare\'s page, and Approve finishes it', async () => {
    const d = await startDaemon({ config: { devFakeCloudflare: true } });
    close = d.close;
    const fake = d.services!.cloudflare as FakeCloudflare;
    expect(fake).toBeInstanceOf(FakeCloudflare);

    // Nothing waiting yet: the page says to start in hlabs.
    let page = await fetch(`${d.url}/dev/cloudflare/sign-in`);
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await page.text()).toContain('Nothing is waiting');

    const signIn = await fake.signIn();
    expect(signIn.url).toBe('/dev/cloudflare/sign-in');
    page = await fetch(`${d.url}${signIn.url}`);
    const html = await page.text();
    expect(html).toContain('Allow hlabs to set up a tunnel?');
    expect(html).toContain('<code>example.com</code>');
    expect(html).toContain('enctype="text/plain"');

    // As the page's form sends it from the dashboard's address.
    const approved = await fetch(`${d.url}/dev/cloudflare/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'https://hlabs.local' },
      body: '',
    });
    expect(approved.status).toBe(200);
    expect(await approved.text()).toContain('Approved');
    await expect(signIn.done).resolves.toMatchObject({ domain: 'example.com', kind: 'signIn' });
    expect(fake.signingIn).toBe(false);
  });
});
