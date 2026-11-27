// US-SYS-11 · See what is using storage (main instance, admin): Settings › Storage names the disk, says how much is
// free and splits what uses it in a bar with a legend, in decimal units.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-SYS-11 Settings › Storage shows the disk, its free space and what uses it', async ({ page }) => {
  await page.goto('/settings/storage');
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
  const disk = page.getByRole('region', { name: /^This computer/ });
  await expect(disk).toBeVisible();
  await expect(disk).toContainText(/\d+(\.\d)? [KMGT]?B free of \d+(\.\d)? [KMGT]?B/);
  const bar = disk.getByRole('img', { name: /What is using this disk/ });
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAccessibleName(/Apps .*B, Files .*B, Backup cache .*B, hlabs .*B, .*Free .*B/);
  for (const key of ['Apps', 'Files', 'Backup cache', 'hlabs', 'Free']) {
    await expect(disk.locator('.hl-chart-key', { hasText: key }).first()).toBeVisible();
  }
  // Sizes have at most one decimal.
  const legend = (await disk.locator('.hl-chart-legend').innerText()).replace(/\s+/g, ' ');
  expect(legend).not.toMatch(/\d\.\d\d/);
  // The other sections of the page.
  await expect(page.getByRole('group', { name: 'Data location' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Drives' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Clean up' })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
