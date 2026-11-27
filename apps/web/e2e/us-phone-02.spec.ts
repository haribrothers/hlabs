// US-PHONE-02 · Touch targets, safe areas and phone-friendly inputs (main instance): hit areas of at least 44 px with
// 8 px between the tabs, the viewport meta, 16 px fields with the right keyboard, and hover-only controls shown.
import { expect, test, type Locator } from '@playwright/test';
import { MAIN_URL } from './instances';
import { box, expectTouchTarget, phoneOnly, tabBar } from './phone';

test('US-PHONE-02 tabs, the bell, Search, tiles, buttons and the sheet close are at least 44 × 44', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/');
  const tabs = tabBar(page).getByRole('button');
  await expect(tabs).toHaveCount(5);
  for (let i = 0; i < 5; i++) await expectTouchTarget(tabs.nth(i));
  for (let i = 0; i < 4; i++) {
    const a = await box(tabs.nth(i));
    const b = await box(tabs.nth(i + 1));
    expect(b.x - (a.x + a.width), 'space between tabs').toBeGreaterThanOrEqual(8);
  }
  await expectTouchTarget(page.getByRole('button', { name: /^Notifications/ }));
  await expectTouchTarget(page.getByRole('main').getByRole('button', { name: 'Search' }));
  await expectTouchTarget(page.getByRole('link', { name: 'Install app' }).locator('.hl-app-icon'));

  await page.goto('/store');
  const install = page.getByRole('link', { name: /^Install / }).first();
  await expectTouchTarget(install);
  await install.click();
  // The install sheet closes with its own Cancel (PhoneRedesignA_InstallSheet).
  await expectTouchTarget(page.getByRole('dialog').getByRole('button', { name: 'Cancel' }));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  // A dialog that is a sheet has its "✕" Close.
  await page.goto('/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expectTouchTarget(page.getByRole('dialog', { name: 'Notifications' }).getByRole('button', { name: 'Close' }));
});

const fontSize = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

test('US-PHONE-02 the viewport covers the notch and zoom stays on; fields are at least 16 px with the right keys', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/store');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    'width=device-width, initial-scale=1, viewport-fit=cover',
  );
  const search = page
    .getByRole('searchbox')
    .or(page.getByPlaceholder(/^Search \d+ apps?$/))
    .first();
  expect(await fontSize(search)).toBeGreaterThanOrEqual(16);
  await expect(search).toHaveAttribute('enterkeyhint', 'search');
  await page
    .getByRole('main')
    .getByRole('link', { name: /^Install / })
    .first()
    .click();
  const field = page.getByRole('dialog').getByRole('textbox').first();
  if (await field.count()) expect(await fontSize(field)).toBeGreaterThanOrEqual(16);
});

test('US-PHONE-02 with no hover, a notification shows its dismiss button', async ({ page, request }, info) => {
  phoneOnly(info);
  await request.post(`${MAIN_URL}/dev/notify`, { data: { title: 'Phone hover check', severity: 'info' } });
  await page.goto('/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Notifications' });
  const dismiss = sheet.getByRole('button', { name: 'Dismiss "Phone hover check"' }).first();
  await expect(dismiss).toHaveCSS('opacity', '1');
  await expectTouchTarget(dismiss);
  await dismiss.click();
});
