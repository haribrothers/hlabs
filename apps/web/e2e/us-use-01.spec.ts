// US-USE-01 · See host CPU, memory, storage and network at a glance (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-USE-01 Live usage shows the engine, the time range and the four tiles', async ({ page }) => {
  await page.goto('/usage');
  await expect(page.getByRole('heading', { level: 1, name: 'Live usage' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Time range' })).toBeVisible();
  for (const tile of ['CPU', 'Memory', 'Storage', 'Network'])
    await expect(page.getByText(tile, { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d+%$/).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/of \d+(\.\d)? [KMGT]?B used/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('usage.png') });
});
