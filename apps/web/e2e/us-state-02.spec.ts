// US-STATE-02 · Reconnect automatically when the update finishes (main instance, signed in as an admin). The page
// opens as if hlabs had stopped for an update while it was open (its updating flag, set once), the real daemon then
// answers /healthz, and system.health is answered as the new version, 99.0.0. One route only: with several, Playwright
// can leave requests hanging.
import { expect, test } from '@playwright/test';

test('US-STATE-02 the page reloads by itself on the same route and says hlabs is up to date', async ({ page }) => {
  // Two cold page loads on the dev server (before and after the reload).
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e.seeded')) return;
    sessionStorage.setItem('e2e.seeded', '1');
    sessionStorage.setItem('hlabs.updating', JSON.stringify({ since: Date.now(), fromVersion: '0.0.0' }));
  });
  await page.route(/\/trpc\/system\.health(\?|$)/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ result: { data: { status: 'ok', version: '99.0.0' } } }),
    }),
  );
  await page.goto('/settings/updates');
  // hlabs answers: the page reloads on the same route, and says so once.
  const toast = page.locator('.hl-toast-title', { hasText: 'hlabs is up to date' });
  await expect(toast).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Version 99.0.0')).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/updates$/);
  // The reloaded route can wait on the dev server while the toast (outside the routes) is already up.
  await expect(page.getByRole('heading', { level: 1, name: 'Updates' })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => sessionStorage.getItem('hlabs.updating'))).toBeNull();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
