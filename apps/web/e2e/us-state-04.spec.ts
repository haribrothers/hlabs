// US-STATE-04 · Serve a fallback page when the daemon is down. Caddy arrives in phase 2; here Playwright plays its
// part: every page gets the built fallback page with 503, and /healthz says daemon_unreachable.
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('US-STATE-04 the fallback page says what to check, and needs nothing from the daemon', async ({ page }) => {
  const html = await readFile(resolve(import.meta.dirname, '../dist-fallback/index.html'), 'utf8');
  const requests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.pathname === '/healthz') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"reason":"daemon_unreachable"}' });
    }
    if (route.request().resourceType() === 'document') {
      return route.fulfill({ status: 503, contentType: 'text/html', body: html });
    }
    return route.abort();
  });

  const res = await page.goto('/files/photos');
  expect(res?.status()).toBe(503);
  await expect(page.getByRole('heading', { level: 1, name: "Can't reach hlabs" })).toBeVisible();
  await expect(page.getByText('Trying again in 5 seconds…')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Things to check' }).getByRole('listitem')).toHaveCount(3);
  await expect(page.getByText('systemctl status hlabsd')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try now' })).toBeVisible();
  // Only the page itself (and later /healthz): no /trpc, scripts, styles or fonts from anywhere.
  expect(requests.filter((p) => p !== '/files/photos' && p !== '/healthz')).toEqual([]);
  // Fits the screen with no sideways scrolling, also on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
