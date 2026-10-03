// US-STATE-01 · Show a full-screen updating state (main instance). /healthz is answered here as a daemon restarting
// after an update would ("updating", step 3), for this page and for a signed-out visitor.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function updating(page: Page) {
  await page.route('**/healthz', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ reason: 'updating', step: 3, steps: 4, stepLabel: 'Checking apps' }),
    }),
  );
}

test('US-STATE-01 every route gives way to "Updating hlabs" with its step', async ({ page }) => {
  await updating(page);
  await page.goto('/settings');
  // The first visit can wait on the dev server compiling the page; the gate asks /healthz every 5 s.
  await expect(page.getByRole('heading', { level: 1, name: 'Updating hlabs' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Step 3 of 4 · Checking apps')).toBeVisible();
  await expect(page).toHaveTitle('Updating hlabs');
  await expect(page.getByRole('progressbar', { name: 'Updating hlabs' })).toHaveAttribute('aria-valuenow', '50');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // "Go to Home" reloads at /, where it shows again.
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Updating hlabs' })).toBeVisible({ timeout: 10_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('US-STATE-01 a signed-out visitor sees it too', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await updating(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Updating hlabs' })).toBeVisible({ timeout: 30_000 });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await context.close();
});
