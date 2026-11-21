// US-SITE-05 · Install on Linux with the command from the site: install.sh comes from the latest stable release
// (here the fixture's 0.6.0), with its checksum and signature. The script's --channel beta is tested with the other
// install.sh tests (apps/cli/test/us-site-05.test.ts).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, 'fixtures/releases/assets/v0.6.0', name), 'utf8');

test.describe('US-SITE-05', () => {
  test('serves the stable release’s install.sh, its checksum and its signature', async ({ request }) => {
    const script = await request.get('/install.sh');
    expect(script.ok()).toBe(true);
    const text = await script.text();
    expect(text).toBe(fixture('install.sh'));

    const sum = await (await request.get('/install.sh.sha256')).text();
    expect(sum).toBe(`${createHash('sha256').update(text).digest('hex')}  install.sh\n`);
    // The same hash the release lists in its SHA256SUMS.
    expect(fixture('SHA256SUMS')).toContain(sum.trim());

    expect(await (await request.get('/install.sh.sig')).text()).toBe(fixture('install.sh.sig'));
  });

  test('is served as plain text for at most 5 minutes (Cloudflare Pages headers)', () => {
    const headers = readFileSync(resolve(import.meta.dirname, '../public/_headers'), 'utf8');
    for (const path of ['/install.sh', '/install.sh.sha256', '/install.sh.sig']) {
      const block = new RegExp(`^${path.replace(/\./g, '\\.')}\\n((?:  .+\\n?)+)`, 'm').exec(headers)?.[1] ?? '';
      expect(block, path).toContain('Content-Type: text/plain');
      const maxAge = Number(/max-age=(\d+)/.exec(block)?.[1]);
      expect(maxAge, path).toBeLessThanOrEqual(300);
    }
  });

  test('the install guide shows how to check the script first', async ({ page }) => {
    await page.goto('/help/install/linux-server/');
    const check = page.locator('pre', { hasText: 'sha256sum -c install.sh.sha256' });
    await expect(check).toBeVisible();
    await expect(
      page.getByText('curl -fsSL https://hlabs.h4loom.com/install.sh | sh -s -- --channel beta'),
    ).toBeVisible();
  });
});
