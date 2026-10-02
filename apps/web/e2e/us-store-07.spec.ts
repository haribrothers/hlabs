// US-STORE-07 · See requirements and what an app can access (main instance, admin, built-in store). Warnings depend on
// this computer's memory and disk, so they're covered by the component and daemon tests; here, the access list.
import { expect, test } from '@playwright/test';

test('US-STORE-07 the access list says what the app can reach, in plain words', async ({ page }) => {
  await page.goto('/store/app/immich');
  const access = page.getByRole('list', { name: 'What it can access' });
  await expect(access.getByText('Internet', { exact: true })).toBeVisible();
  await expect(access.getByText('Photo library', { exact: true })).toBeVisible();
  await expect(access.getByText(/^Read and write/)).toBeVisible();
  // Immich asks for nothing risky.
  await expect(access.getByText('Risky')).toHaveCount(0);
});
