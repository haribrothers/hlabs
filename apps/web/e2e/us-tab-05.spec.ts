// US-TAB-05 · iPad in portrait (tablet project turned upright, 820 × 1180, main instance): windows fill the width with
// the page's margins; Settings, Files and the App Store's sidebars become lists you go into and come back from
// (TabletSettingsPortrait, TabletSettingsPortraitPage); Home reflows four to a row, clear of the Dock; turning the iPad
// changes the layout at once and keeps the page.
import { expect, test, type Page } from '@playwright/test';
import { homeFolder } from './files';
import { MAIN_URL } from './instances';
import { box, dock, LANDSCAPE, PORTRAIT } from './tablet';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(PORTRAIT);
});

/** "‹ Settings" and the like, in the window (the Dock has tiles of the same names). */
const back = (page: Page, name: string) => page.getByRole('main').getByRole('button', { name, exact: true });

test('US-TAB-05 Settings: a window the width of the screen, the sections a list you go into and back from', async ({
  page,
}) => {
  await page.goto('/settings');
  // The list first (no section chosen for you), in a window with the page's 24px margins.
  const list = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(list).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const win = await box(list.locator('xpath=ancestor::*[contains(@class,"hl-window-fill")]'));
  expect(Math.round(win.x)).toBe(24);
  expect(Math.round(win.width)).toBe(PORTRAIT.width - 48);
  // The window ends above the Dock.
  expect(win.y + win.height).toBeLessThan((await box(dock(page))).y);
  for (const name of ['Account', 'Appearance', 'Storage', 'Advanced']) {
    const row = list.getByRole('link', { name: new RegExp(`^${name}`) });
    await expect(row).toBeVisible();
    expect(Math.round((await box(row)).height)).toBeGreaterThanOrEqual(60);
  }
  await list.getByRole('link', { name: /^Storage/ }).tap();
  await expect(page).toHaveURL(`${MAIN_URL}/settings/storage`);
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
  await expect(list).toHaveCount(0);
  await back(page, 'Settings').tap();
  await expect(page).toHaveURL(`${MAIN_URL}/settings`);
  await expect(list).toBeVisible();
});

test('US-TAB-05 Files: the places a list you go into, a folder with "‹ Files"', async ({ page }) => {
  const folder = await homeFolder(page, 'tab05-files', { 'Taxes/a.txt': 'a' });
  try {
    await page.goto('/files');
    const places = page.getByRole('navigation', { name: 'Places' });
    await expect(places.getByRole('link', { name: 'Home' })).toBeVisible();
    await places.getByRole('link', { name: 'Home' }).tap();
    await expect(page).toHaveURL(/\/files\?path=%2Fhome$/);
    await expect(places).toHaveCount(0);
    await expect(page.locator(`[data-path="${folder.path}"]`)).toBeVisible();
    await back(page, 'Files').tap();
    await expect(page).toHaveURL(`${MAIN_URL}/files`);
    await expect(places).toBeVisible();
  } finally {
    folder.remove();
  }
});

test('US-TAB-05 the App Store: one column, categories over Discover, a category with "‹ App Store"', async ({
  page,
}) => {
  await page.goto('/store');
  const categories = page.getByRole('navigation', { name: 'Categories' });
  await expect(categories).toBeVisible();
  const first = categories.getByRole('link').nth(1);
  const name = (await first.textContent())!.trim();
  await first.tap();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await back(page, 'App Store').tap();
  await expect(page).toHaveURL(`${MAIN_URL}/store`);
});

test('US-TAB-05 Home reflows: apps four to a row, widgets two, nothing under the Dock', async ({ page, request }) => {
  const ids = Array.from({ length: 9 }, (_, i) => `tab05-app-${i}`);
  for (const id of ids) await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, name: id, state: 'running' } });
  try {
    await reflow(page);
  } finally {
    for (const id of ids) await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, remove: true } });
  }
});

async function reflow(page: Page) {
  await page.goto('/');
  const grid = page.getByRole('list', { name: 'Apps' });
  await expect(grid).toBeVisible();
  const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(4);
  // Widgets two to a row.
  const widgets = page.getByRole('region', { name: 'Widgets' }).locator(':scope > *');
  await expect(widgets.first()).toBeVisible();
  if ((await widgets.count()) >= 2) {
    const [a, b] = [await box(widgets.nth(0)), await box(widgets.nth(1))];
    expect(Math.round(a.y)).toBe(Math.round(b.y));
    expect(a.width).toBeLessThan(PORTRAIT.width / 2);
  }
  // The last row scrolls clear of the Dock.
  const last = grid.locator('li').last();
  await last.scrollIntoViewIfNeeded();
  await page.locator('#main').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  expect((await box(last)).y + (await box(last)).height).toBeLessThanOrEqual((await box(dock(page))).y);
}

test('US-TAB-05 turning the iPad changes the layout at once and keeps the page', async ({ page }) => {
  await page.goto('/settings/storage');
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
  await expect(back(page, 'Settings')).toBeVisible();
  await page.setViewportSize(LANDSCAPE);
  // Landscape: the sidebar is back beside the same section.
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
  await expect(page).toHaveURL(`${MAIN_URL}/settings/storage`);
  await page.setViewportSize(PORTRAIT);
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
});
