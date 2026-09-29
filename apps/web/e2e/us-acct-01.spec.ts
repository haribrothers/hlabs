// US-ACCT-01 · Settings sections depend on role (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('US-ACCT-01', () => {
  test.skip(({ isMobile }) => isMobile, 'the phone layout is US-ACCT-02');

  test('Settings opens on Account with the sections an admin can use now', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings\/account$/);
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(nav.getByRole('link')).toHaveText(['Account', 'Engine & startup']);
    await expect(nav.getByRole('link', { name: 'Account' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('a section from a later phase, or an unknown one, is "Page not found"', async ({ page }) => {
    await page.goto('/settings/users');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/users$/);
    await page.goto('/settings/nope');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});
