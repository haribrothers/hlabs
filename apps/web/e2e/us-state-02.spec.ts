// US-STATE-02 · Reconnect automatically when the update finishes (main instance, signed in as an admin). /healthz says
// "updating" for a while, then the real daemon answers; system.health is answered as the new version, 99.0.0.
import { expect, test } from '@playwright/test';

test('US-STATE-02 the page reloads by itself on the same route and says hlabs is up to date', async ({ page }) => {
  await page.goto('/settings/updates');
  // The first visit can wait on the dev server compiling the page.
  await expect(page.getByRole('heading', { level: 1, name: 'Updates' })).toBeVisible({ timeout: 30_000 });
  await page.route('**/healthz', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ reason: 'updating', step: 2, steps: 4, stepLabel: 'Restarting apps' }),
    }),
  );
  await expect(page.getByRole('heading', { name: 'Updating hlabs' })).toBeVisible({ timeout: 15_000 });
  await page.route(/\/trpc\/system\.health(\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ result: { data: { status: 'ok', version: '99.0.0' } } }),
    }),
  );
  await page.unroute('**/healthz');
  // The toast (the Updates page has its own "hlabs is up to date" too).
  const toast = page.locator('.hl-toast-title', { hasText: 'hlabs is up to date' });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Version 99.0.0')).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/updates$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Updates' })).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
