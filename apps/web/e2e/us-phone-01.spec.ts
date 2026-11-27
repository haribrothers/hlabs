// US-PHONE-01 · Switch to the phone layout with a bottom tab bar (main instance, admin): the tab bar instead of the
// Dock, its five tabs and what each opens, the App Store badge, crossing 768 px without a reload, and the tab of the page
// you're on taking it back to the top.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { phoneOnly, tabBar } from './phone';

test('US-PHONE-01 the tab bar docked to the bottom: Home, App Store, Files, Usage, Settings, each opening its page', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/');
  const bar = tabBar(page);
  await expect(bar).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Dock' })).toBeHidden();
  const tabs = bar.getByRole('button');
  await expect(tabs).toHaveText([/Home/, /App Store/, /Files/, /Usage/, /Settings/]);
  // Docked to the bottom edge across the whole width, 49px plus the home-indicator room (D-172).
  const box = (await bar.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.round(box.y + box.height)).toBe(viewport.height);
  expect(Math.round(box.width)).toBe(viewport.width);
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(49 + 34);
  // The current tab: the accent colour and a soft highlight behind its glyph, not colour alone.
  await expect(bar.getByRole('button', { name: /^Home/ }).locator('.hl-tab-lens')).toBeVisible();
  // A tap leaves no focus ring.
  await bar.getByRole('button', { name: /^Home/ }).click();
  await expect(bar.getByRole('button', { name: /^Home/ })).toHaveCSS('outline-style', 'none');
  await expect(bar.getByRole('button', { name: 'Search' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: /^Home/ })).toHaveAttribute('aria-current', 'page');
  for (const [tab, path] of [
    ['App Store', '/store'],
    ['Files', '/files'],
    ['Usage', '/usage'],
    ['Settings', '/settings'],
    ['Home', '/'],
  ] as const) {
    await bar.getByRole('button', { name: new RegExp(`^${tab}`) }).click();
    await expect(page).toHaveURL(new RegExp(`${MAIN_URL}${path}(/[a-z]+)?$`));
    await expect(bar.getByRole('button', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-current', 'page');
  }
});

test('US-PHONE-01 the App Store tab counts the updates, "N updates"', async ({ page, request }, info) => {
  phoneOnly(info);
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: 'gitea', behind: '0.0.1' } });
  try {
    await page.goto('/');
    const badge = tabBar(page).locator('.hl-count');
    await expect(badge).toHaveText(/^([1-9]|9\+)$/);
    await expect(badge).toHaveAttribute('aria-label', /^\d+ updates?$/);
  } finally {
    await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: 'gitea', remove: true } });
  }
});

test('US-PHONE-01 crossing 768 px swaps the tab bar and the Dock without a reload, on the same page', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/store');
  await expect(tabBar(page)).toBeVisible();
  await page.evaluate(() => ((window as { stayed?: boolean }).stayed = true));
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(page.getByRole('navigation', { name: 'Dock' })).toBeVisible();
  await expect(tabBar(page)).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tabBar(page)).toBeVisible();
  expect(await page.evaluate(() => (window as { stayed?: boolean }).stayed)).toBe(true);
  await expect(page).toHaveURL(`${MAIN_URL}/store`);
});

test('US-PHONE-01 the tab of the page you are on scrolls it back to the top', async ({ page }, info) => {
  phoneOnly(info);
  await page.goto('/store');
  await expect(page.getByRole('heading', { level: 1, name: 'App Store' })).toBeVisible();
  await expect(page.locator('.hl-p-li').first()).toBeVisible();
  const main = page.locator('#main');
  await main.evaluate((el) => el.scrollTo({ top: 1200 }));
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await tabBar(page)
    .getByRole('button', { name: /^App Store/ })
    .click();
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBe(0);
});
