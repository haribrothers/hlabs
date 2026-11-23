// US-STORE-03 · Search from the store home (main instance, admin).
import { expect, test } from '@playwright/test';

test('US-STORE-03 "Search N apps"; typing opens the results; clearing goes back to where you were', async ({
  page,
}, info) => {
  // On a phone a category is a page you go into, whose search button leads to the store's field (D-172).
  const phone = info.project.name === 'phone';
  const from = phone ? '/store' : '/store/category/security';
  await page.goto(from);
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
  await expect(page).toHaveURL(phone ? /\/store$/ : /\/store\/category\/security$/);
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
  // Nothing focused (a click could land on a card and open its details).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox', { name: 'Search apps' })).toBeFocused();
});
