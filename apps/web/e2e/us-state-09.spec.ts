// US-STATE-09 · Start the engine from the banner (main instance, admin, desktop; serial project). The daemon reports
// its engine stopped through a dev-only route; its pretend engine control "starts" it again, without touching the
// real one.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';

const ID = 'start-demo';

test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/engine`, { data: { running: true } });
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, remove: true } });
});

test('US-STATE-09 Start engine starts it and Home comes back', async ({ page, request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: ID, name: 'Start demo' } });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Start demo' })).toBeVisible();
  await request.post(`${MAIN_URL}/dev/engine`, { data: { running: false } });
  const banner = page.getByRole('status').filter({ hasText: 'The container engine has stopped' });
  await banner.getByRole('button', { name: 'Start engine' }).click({ timeout: 5_000 });
  await expect(banner).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Open Start demo' })).toBeVisible();
});
