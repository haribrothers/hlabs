// US-PHONE-08 · App grid and opening apps on phone (main instance, admin): four to a row of 60px tiles with one-line
// names and "Install app"; a running app opens in a new tab; a stopped one opens its settings as a full-height sheet
// over Home; a long press opens the tile's menu over the blurred Home (D-172); "Install app" opens the App Store.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { box, longPress, phoneOnly } from './phone';

// The tests share the two pretend apps, added and removed around each: one at a time.
test.describe.configure({ mode: 'serial' });

const RUNNING = 'phone-grid-running';
const STOPPED = 'phone-grid-stopped';

test.beforeEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, {
    data: { id: RUNNING, name: 'Phone grid app with a long name', state: 'running' },
  });
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: STOPPED, name: 'Phone stopped', state: 'stopped' } });
});
test.afterEach(async ({ request }) => {
  for (const id of [RUNNING, STOPPED]) await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, remove: true } });
});

test('US-PHONE-08 four to a row, names on one line, then "Install app", clear of the tab bar', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/');
  const grid = page.getByRole('list', { name: 'Apps' });
  await expect(grid).toBeVisible();
  const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(4);
  const name = grid.locator(`[data-app="${RUNNING}"] .hl-app-name`);
  await expect(name).toHaveCSS('white-space', 'nowrap');
  await expect(name).toHaveCSS('text-overflow', 'ellipsis');
  const install = grid.getByRole('link', { name: 'Install app' });
  await expect(grid.locator('li').last()).toContainText('Install app');
  await install.scrollIntoViewIfNeeded();
  const bar = await box(page.getByRole('navigation', { name: 'Tab bar' }));
  const tile = await box(install);
  // 60px tiles (D-172).
  const icon = await box(grid.locator(`[data-app="${RUNNING}"] .hl-app-icon`));
  expect(Math.round(icon.width)).toBe(60);
  expect(Math.round(icon.height)).toBe(60);
  expect(tile.y + tile.height).toBeLessThanOrEqual(bar.y);
  await install.click();
  await expect(page).toHaveURL(`${MAIN_URL}/store`);
});

test('US-PHONE-08 a running app opens in a new tab; the dashboard stays', async ({ page }, info) => {
  phoneOnly(info);
  await page.goto('/');
  // A new tab asks for the app's address (it doesn't resolve here, so the tab itself ends on an error page).
  const asked = page.context().waitForEvent('request', (r) => r.url().includes(RUNNING));
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open Phone grid app with a long name' }).click();
  await popup;
  expect((await asked).url()).toContain(`${RUNNING}.`);
  await expect(page).toHaveURL(`${MAIN_URL}/`);
});

test("US-PHONE-08 an admin's tap on a stopped app opens its settings: a full-height sheet over Home", async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/');
  await page.getByRole('button', { name: 'Phone stopped, stopped' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?settings=${STOPPED}$`));
  const sheet = page.getByRole('dialog', { name: 'Phone stopped' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
  // Over the page it came from (D-166): Home stays rendered behind it.
  await expect(page.locator('h1', { hasText: /^Home$/ })).toBeAttached();
  const viewport = page.viewportSize()!;
  await expect.poll(async () => Math.round((await box(sheet)).y + (await box(sheet)).height)).toBe(viewport.height);
  expect(Math.round((await box(sheet)).width)).toBe(viewport.width);
  // The four tabs as a segmented control.
  await expect(sheet.getByRole('tab')).toHaveText(['Overview', 'Configuration', 'Permissions', 'Usage']);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(`${MAIN_URL}/`);
});

test("US-PHONE-08 an admin's long press opens the tile's menu, not the OS menu; Settings opens the app's settings", async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/');
  const tile = page.getByRole('button', { name: 'Open Phone grid app with a long name' });
  await expect(tile).toBeVisible();
  await longPress(page, tile);
  const menu = page.getByRole('menu', { name: /Phone grid app with a long name/ });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['Open', 'Settings', 'Logs', 'Restart', 'Uninstall…']);
  await expect(page.locator('.hl-p-menu-scrim')).toBeVisible();
  // Still on Home: the press didn't open the app.
  await expect(page).toHaveURL(`${MAIN_URL}/`);
  await menu.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?settings=${RUNNING}$`));
  await expect(page.getByRole('dialog', { name: 'Phone grid app with a long name' })).toBeVisible();
});
