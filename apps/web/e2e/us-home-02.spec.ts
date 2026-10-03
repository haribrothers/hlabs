// US-HOME-02 · Glance at system widgets (main instance, signed in as an admin). Storage, and from phase 4 (which e2e
// previews) Live usage too.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-HOME-02 the Storage widget shows free space and opens Usage', async ({ page }) => {
  await page.goto('/');
  const widgets = page.getByRole('region', { name: 'Widgets' });
  const storage = widgets.getByRole('link', { name: /^Storage/ });
  // The first visit can wait on the dev server compiling the page.
  await expect(storage).toBeVisible({ timeout: 15_000 });
  await expect(storage).toContainText(/\d+(\.\d)? [KMGT]?B\s*left of \d+(\.\d)? [KMGT]?B/);
  await expect(widgets.getByRole('link', { name: /^Live usage/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await storage.click();
  await expect(page).toHaveURL(/\/usage$/);
});
