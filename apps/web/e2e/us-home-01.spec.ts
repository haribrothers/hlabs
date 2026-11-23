// US-HOME-01 · See a greeting over my wallpaper (main instance, signed in).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-HOME-01 Home greets me over the wallpaper', async ({ page }, info) => {
  await page.goto('/');
  if (info.project.name === 'phone') {
    // PhoneHome (D-172): "Home" as a large title, the greeting under it.
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(page.getByText(/^(Good (morning|afternoon|evening)|Welcome to hlabs), .+\./)).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), .+$/ })).toBeVisible();
  }
  await expect(page).toHaveTitle('hlabs — Home');
  await expect(page.locator('html')).toHaveAttribute('data-accent', /^(violet|mint|amber|rose)$/);
  await expect(page.locator('.hl-wall').first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
