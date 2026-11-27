// US-PHONE-10 · Browse the App Store on phone (main instance, admin): the title, "Search N apps", the chips from
// Discover, one Featured card with View, list sections with one button per row; search replaces the sections and
// clearing it brings them back; a chip filters; "N updates" opens the updates full-screen.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { phoneOnly } from './phone';

test('US-PHONE-10 title, search, chips, a Featured card with View, and rows with one button', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/store');
  await expect(page.getByRole('heading', { level: 1, name: 'App Store' })).toBeVisible();
  await expect(page.getByPlaceholder(/^Search \d+ apps$/)).toBeVisible();
  const chips = page.getByRole('navigation', { name: 'Categories' }).getByRole('link');
  await expect(chips.first()).toHaveText('Discover');
  await expect(chips.first()).toHaveAttribute('aria-current', 'page');
  const featured = page.getByRole('region', { name: 'Featured' });
  await expect(featured.getByRole('heading', { name: 'Featured' })).toBeVisible();
  // The first row section after Featured: logo, name and tagline (one link) and one pill.
  const list = page.getByRole('main').locator('ul:has(.hl-p-li)').first();
  const row = list.getByRole('listitem').first();
  await expect(row.locator('.hl-p-li-text')).toHaveCount(1);
  await expect(row.locator('.hl-p-get')).toHaveCount(1);
  await expect(
    row.getByRole('link', { name: /^Install / }).or(row.getByRole('button', { name: /^Open |Installing/ })),
  ).toBeVisible();
  await featured
    .getByRole('link', { name: /^View / })
    .first()
    .click();
  await expect(page).toHaveURL(/\/store\/app\/[a-z0-9-]+$/);
});

test('US-PHONE-10 search replaces the sections; clearing it brings them back; a chip filters', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/store');
  const field = page.getByPlaceholder(/^Search \d+ apps$/);
  await field.fill('photo');
  await expect(page).toHaveURL(/\/store\/search\?q=photo$/);
  await expect(page.getByRole('list', { name: 'Results for “photo”' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Featured' })).toHaveCount(0);
  await field.fill('');
  await expect(page).toHaveURL(`${MAIN_URL}/store`);
  await expect(page.getByRole('region', { name: 'Featured' })).toBeVisible();
  const media = page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Media' });
  await media.click();
  await expect(page).toHaveURL(`${MAIN_URL}/store/category/media`);
  await expect(media).toHaveAttribute('aria-current', 'page');
});

test('US-PHONE-10 "N updates" above the sections opens the updates', async ({ page, request }, info) => {
  phoneOnly(info);
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: 'n8n', behind: '0.0.1' } });
  try {
    await page.goto('/store');
    const row = page.getByRole('link', { name: /^\d+ updates?$/ });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(`${MAIN_URL}/store/updates`);
    await expect(page.getByRole('heading', { name: 'Updates' }).first()).toBeVisible();
  } finally {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: 'n8n', remove: true } });
  }
});
