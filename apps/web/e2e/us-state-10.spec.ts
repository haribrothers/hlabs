// US-STATE-10 · Recover automatically when the engine comes back (main instance; serial project). The daemon reports
// its engine stopped, then back as if started outside hlabs, through a dev-only route.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/engine`, { data: { running: true } });
});

test('US-STATE-10 the banner goes by itself when the engine is back, and Home says so', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Search apps, files, settings/ })).toBeVisible();
  await request.post(`${MAIN_URL}/dev/engine`, { data: { running: false } });
  const banner = page.getByRole('status').filter({ hasText: 'The container engine has stopped' });
  await expect(banner).toBeVisible({ timeout: 4_000 });

  await request.post(`${MAIN_URL}/dev/engine`, { data: { running: true } });
  await expect(banner).toHaveCount(0, { timeout: 2_500 });
  await expect(page.getByText('The container engine is running')).toBeVisible();
});
