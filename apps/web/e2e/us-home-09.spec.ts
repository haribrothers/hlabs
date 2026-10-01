// US-HOME-09 · Open search from anywhere (main instance; the dev server previews phase 2, D-092).
import { expect, test } from '@playwright/test';

test('US-HOME-09 the shortcut and the Home pill open Search; the shortcut again or Escape closes it', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'The keyboard shortcut and pill are the desktop layout');
  await page.goto('/');
  const pill = page.getByRole('button', { name: /Search apps, files, settings/ });
  await expect(pill).toBeVisible();
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+k`);
  const panel = page.getByRole('dialog', { name: 'Search' });
  await expect(panel.getByRole('combobox', { name: 'Search' })).toBeFocused();
  await expect(panel).toContainText('to close');
  await page.keyboard.press(`${mod}+k`);
  await expect(panel).toHaveCount(0);

  await pill.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(pill).toBeFocused();

  await page.getByTestId('dock-bar').getByRole('button', { name: 'Search' }).click();
  await expect(panel).toBeVisible();
});
