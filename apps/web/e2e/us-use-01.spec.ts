// US-USE-01 · See host CPU, memory, storage and network at a glance (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-USE-01 Live usage shows the engine, the time range and the four tiles', async ({ page }) => {
  await page.goto('/usage');
  // The first visit can wait on the dev server compiling the page.
  await expect(page.getByRole('heading', { level: 1, name: 'Live usage' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('radiogroup', { name: 'Time range' })).toBeVisible();
  const tiles = page.getByRole('group', { name: 'Summary' });
  for (const tile of ['CPU', 'Memory', 'Storage', 'Network'])
    await expect(tiles.getByText(tile, { exact: true })).toBeVisible();
  await expect(tiles.getByText(/^\d+%$/)).toBeVisible({ timeout: 30_000 });
  await expect(tiles.getByText(/of \d+(\.\d)? [KMGT]?B used/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
