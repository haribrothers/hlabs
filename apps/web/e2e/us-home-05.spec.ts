// US-HOME-05 · See badge counts in the Dock (main instance). The update badge waits for the App Store updates list
// (phase 7, D-036): until then no badge shows and the dashboard never asks for updates.
import { expect, test } from '@playwright/test';

test('US-HOME-05 no update badge and no updates request before phase 7', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('store.listUpdates')) asked.push(r.url());
  });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Dock' }).or(page.getByRole('navigation', { name: 'Tab bar' }));
  await expect(nav).toBeVisible();
  await expect(nav.locator('.hl-dock-badge, .hl-count')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(asked).toEqual([]);
});
