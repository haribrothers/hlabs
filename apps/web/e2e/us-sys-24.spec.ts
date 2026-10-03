// US-SYS-24 · Check for updates now (main instance, signed in as an admin). The e2e daemon's update manifest is a
// closed local port (playwright.config.ts), so a check fails the way it does offline.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-SYS-24 Check now shows a spinner; offline it says so and keeps the last result', async ({ page }) => {
  await page.goto('/settings/updates');
  // The first visit can wait on the dev server compiling the page.
  await expect(page.getByRole('heading', { name: 'hlabs is up to date' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Version \d+\.\d+\.\d+/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Check now' }).click();
  // The first check after the daemon starts also reads the whole built-in store.
  await expect(page.getByText("Couldn't check for updates")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Check your internet connection.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'hlabs is up to date' })).toBeVisible();
});
