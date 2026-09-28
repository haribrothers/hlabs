// US-HOME-01 · See a greeting over my wallpaper (main instance, signed in).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-HOME-01 Home greets me over the wallpaper', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), .+$/ })).toBeVisible();
  await expect(page).toHaveTitle('hlabs — Home');
  await expect(page.locator('html')).toHaveAttribute('data-accent', /^(violet|mint|amber|rose)$/);
  await expect(page.locator('.hl-wall').first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
