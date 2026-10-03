// US-SYS-26 · Choose automatic updates (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-SYS-26 the overnight switches are saved', async ({ page }) => {
  await page.goto('/settings/updates');
  // The first visit can wait on the dev server compiling the page.
  const apps = page.getByRole('switch', { name: 'Update apps automatically' });
  await expect(apps).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('switch', { name: 'Update hlabs automatically' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Back up app data before updating' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const before = await apps.isChecked();
  await apps.click();
  await expect(apps).toBeChecked({ checked: !before });
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Update apps automatically' })).toBeChecked({
    checked: !before,
    timeout: 30_000,
  });
  // Back as it was, for the other specs on this instance.
  await page.getByRole('switch', { name: 'Update apps automatically' }).click();
  await expect(page.getByRole('switch', { name: 'Update apps automatically' })).toBeChecked({ checked: before });
});
