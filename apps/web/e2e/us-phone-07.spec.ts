// US-PHONE-07 · Phone Home header and widgets (main instance, admin): the greeting with the bell and Search, the bell's
// dot and its sheet, the widgets above the apps, Live usage opening Usage, and a long press doing nothing.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { box, phoneOnly } from './phone';

test('US-PHONE-07 the greeting, the bell with a dot and Search; the bell opens a bottom sheet', async ({
  page,
  request,
}, info) => {
  phoneOnly(info);
  await request.post(`${MAIN_URL}/dev/notify`, { data: { title: 'Phone bell check', severity: 'info' } });
  await page.goto('/');
  // "Home" as a large title with the bell beside it, the greeting under it, then Search (D-172).
  const title = page.getByRole('heading', { level: 1, name: 'Home' });
  await expect(title).toHaveCSS('font-size', '34px');
  // The greeting (or, with nothing installed yet, the welcome).
  const greeting = page.getByText(/^(Good (morning|afternoon|evening)|Welcome to hlabs), .+\./);
  await expect(greeting).toBeVisible();
  const bell = page.getByRole('button', { name: /^Notifications, \d+ new$/ });
  const search = page.getByRole('main').getByRole('button', { name: 'Search' });
  await expect(bell).toBeVisible();
  expect(Math.abs((await box(bell)).y + 22 - ((await box(title)).y + (await box(title)).height / 2))).toBeLessThan(12);
  expect((await box(greeting)).y).toBeGreaterThan((await box(title)).y);
  expect((await box(search)).y).toBeGreaterThan((await box(greeting)).y);
  // Search, the title and the first widget share the page's gutter.
  const widget = page.locator('.hl-p-widget').first();
  expect(Math.round((await box(widget)).x)).toBe(Math.round((await box(search)).x));
  await bell.click();
  const sheet = page.getByRole('dialog', { name: 'Notifications' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
  await expect(sheet.getByText('Phone bell check').first()).toBeVisible();
});

test('US-PHONE-07 the widgets come before the apps; Live usage opens Usage', async ({ page }, info) => {
  phoneOnly(info);
  await page.goto('/');
  const widgets = page.getByRole('region', { name: 'Widgets' });
  await expect(widgets).toBeVisible();
  const usage = widgets.getByRole('link', { name: /^Live usage/ });
  await expect(usage).toContainText('CPU');
  await expect(usage).toContainText('Memory');
  await expect(widgets.getByRole('link', { name: /^Storage/ })).toContainText(/left of/);
  expect((await box(page.getByRole('list', { name: 'Apps' }))).y).toBeGreaterThan((await box(widgets)).y);
  await usage.click();
  await expect(page).toHaveURL(`${MAIN_URL}/usage`);
});

test('US-PHONE-07 a long press on Home does nothing: no edit mode on a phone', async ({ page }, info) => {
  phoneOnly(info);
  await page.goto('/');
  const greeting = page.getByRole('heading', { level: 1 });
  await expect(greeting).toBeVisible();
  const b = await box(page.getByRole('region', { name: 'Widgets' }));
  await page.mouse.move(b.x + b.width / 2, b.y - 12);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0);
  await expect(page.getByText('Drag to rearrange')).toHaveCount(0);
});
