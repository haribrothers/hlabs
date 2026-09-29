// US-STORE-03 · Search from the store home (main instance, admin).
import { expect, test } from '@playwright/test';

test('US-STORE-03 "Search N apps"; typing opens the results; clearing goes back to where you were', async ({
  page,
}) => {
  await page.goto('/store/category/security');
  const search = page.getByRole('searchbox', { name: 'Search apps' });
  await expect(search).toHaveAttribute('placeholder', /^Search \d+ apps$/);

  await search.fill('photo');
  await expect(page).toHaveURL(/\/store\/search\?q=photo$/);
  await expect(page.getByRole('heading', { name: 'Results for “photo”' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Results for “photo”' }).getByRole('link', { name: 'Immich', exact: true }),
  ).toBeVisible();
  await expect(search).toBeFocused();

  await search.fill('');
  await expect(page).toHaveURL(/\/store\/category\/security$/);
});

test('US-STORE-03 Enter searches at once; Escape clears; nothing found says so', async ({ page }) => {
  await page.goto('/store');
  const search = page.getByRole('searchbox', { name: 'Search apps' });
  await search.fill('zzzz-no-such-app');
  await search.press('Enter');
  await expect(page.getByText('No apps match “zzzz-no-such-app”')).toBeVisible();
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page).toHaveURL(/\/store$/);
});

test('US-STORE-03 "/" focuses the search field on desktop', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Keyboard shortcut is for desktop');
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  await page.locator('body').click();
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Search apps' })).toBeFocused();
});
