// US-STATE-05 · Explain why hlabs can't be reached (the fallback page, with Playwright playing Caddy and /healthz).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('US-STATE-05 the fallback page says why when hlabs knows, and updates in place', async ({ page }) => {
  const html = await readFile(resolve(import.meta.dirname, '../dist-fallback/index.html'), 'utf8');
  let reason = 'starting';
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/healthz') {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ reason }) });
    }
    if (route.request().resourceType() === 'document')
      return route.fulfill({ status: 503, contentType: 'text/html', body: html });
    return route.abort();
  });

  await page.goto('/');
  const line = page.getByText('hlabs is starting. This usually takes less than a minute.');
  await expect(line).toBeVisible();
  await expect(page.getByRole('list', { name: 'Things to check' })).toHaveCount(0);

  reason = 'migration_failed';
  await page.getByRole('button', { name: 'Try now' }).click();
  await expect(page.getByText(/^hlabs couldn't update its database\. Your data hasn't been changed\./)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Things to check' })).toBeVisible();
});
