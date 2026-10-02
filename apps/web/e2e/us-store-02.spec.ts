// US-STORE-02 · Navigate with the categories sidebar (main instance, admin). Categories come from the built-in store.
import { expect, test } from '@playwright/test';

test('US-STORE-02 categories with apps, in order; keyboard moves through them; no "Manage apps" before phase 7', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'The phone uses chips (next test)');
  await page.goto('/store');
  const nav = page.getByRole('navigation', { name: 'Categories' });
  await expect(nav.getByRole('link')).toHaveText([
    'Discover',
    'Media',
    'Files & photos',
    'Networking',
    'Home automation',
    'Developer',
    'Local AI',
    'Productivity',
    'Security',
    'Books',
    'Monitoring',
  ]);
  await expect(nav.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Manage apps' })).toHaveCount(0);

  // Keyboard: each item takes focus with a visible ring, and Enter opens it.
  await nav.getByRole('link', { name: 'Discover' }).focus();
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('link', { name: 'Media' })).toBeFocused();
  await page.keyboard.press('Tab');
  const files = nav.getByRole('link', { name: 'Files & photos' });
  await expect(files).toBeFocused();
  const outline = await files.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/store\/category\/files$/);
  await expect(page.getByRole('heading', { name: 'Files & photos' })).toBeVisible();
  await expect(files).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('list', { name: 'Files & photos' }).getByRole('listitem')).toHaveCount(3);
});

test('US-STORE-02 on a phone, categories are chips above the content', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'Phone layout');
  await page.goto('/store');
  const chips = page.getByRole('navigation', { name: 'Categories' });
  await chips.getByRole('link', { name: 'Security' }).click();
  await expect(page).toHaveURL(/\/store\/category\/security$/);
  await expect(chips.getByRole('link', { name: 'Security' })).toHaveAttribute('aria-current', 'page');
  const box = await chips.getByRole('link', { name: 'Security' }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('US-STORE-02 an unknown category is "Page not found"', async ({ page }) => {
  await page.goto('/store/category/nonsense');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
