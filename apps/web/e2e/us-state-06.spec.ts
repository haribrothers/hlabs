// US-STATE-06 · Retry on a countdown or on demand (the fallback page, with Playwright playing Caddy and /healthz).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('US-STATE-06 the fallback page counts down, Try now checks at once, and hlabs coming back loads the address asked for', async ({
  page,
}) => {
  const html = await readFile(resolve(import.meta.dirname, '../dist-fallback/index.html'), 'utf8');
  let up = false;
  let checks = 0;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/healthz') {
      checks++;
      return up
        ? route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' })
        : route.fulfill({ status: 503, contentType: 'application/json', body: '{"reason":"daemon_unreachable"}' });
    }
    if (route.request().resourceType() === 'document') {
      return up
        ? route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Dashboard</title><h1>Back in</h1>' })
        : route.fulfill({ status: 503, contentType: 'text/html', body: html });
    }
    return route.abort();
  });

  await page.goto('/apps/immich?tab=logs');
  await expect(page.getByText('Trying again in 5 seconds…')).toBeVisible();
  await expect(page.getByText('Trying again in 4 seconds…')).toBeVisible();
  await expect(page.getByText('Trying again in 3 seconds…')).toBeVisible();

  // Try now is the first thing Tab reaches, and Enter checks at once and restarts the countdown.
  const before = checks;
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Try now' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => checks).toBe(before + 1);
  await expect(page.getByText('Trying again in 5 seconds…')).toBeVisible();

  up = true;
  await page.keyboard.press(' ');
  await expect(page.getByRole('heading', { name: 'Back in' })).toBeVisible({ timeout: 1_000 });
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe('/apps/immich?tab=logs');
});
