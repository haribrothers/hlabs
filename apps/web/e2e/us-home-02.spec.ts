// US-HOME-02 · Glance at system widgets (main instance, signed in as an admin). Phase 1 shows Storage only.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-HOME-02 the Storage widget shows free space and opens Usage', async ({ page }) => {
  await page.goto('/');
  const widgets = page.getByRole('region', { name: 'Widgets' });
  const storage = widgets.getByRole('link', { name: /^Storage/ });
  await expect(storage).toBeVisible();
  await expect(storage).toContainText(/\d+(\.\d)? [KMGT]?B\s*left of \d+(\.\d)? [KMGT]?B/);
  await expect(widgets.getByText('Live usage')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await storage.click();
  await expect(page).toHaveURL(/\/usage$/);
});
