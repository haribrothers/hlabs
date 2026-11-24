// US-TAB-02 · Long-press for every right-click menu (tablet project, main instance): a held Home tile lifts over the
// blurred Home with the desktop's items beside it (TabletMenu); a tap outside closes it without opening what's under
// the tap; a finger that moves first scrolls instead; a held file opens the file's menu at the finger. The pinned
// Dock app's menu is in us-tab-04.spec.ts (it needs a Dock of its own).
import { expect, test } from '@playwright/test';
import { homeFolder } from './files';
import { MAIN_URL } from './instances';
import { box, centre, expectTouchMode, Finger, longPress } from './tablet';

test.describe.configure({ mode: 'serial' });

const APP = 'tab02-vault';
const OTHER = 'tab02-other';

test.beforeEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: APP, name: 'Tab vault', state: 'running' } });
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: OTHER, name: 'Tab other', state: 'running' } });
});
test.afterEach(async ({ request }) => {
  for (const id of [APP, OTHER]) await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id, remove: true } });
});

test('US-TAB-02 a held Home tile opens its menu beside it, with the desktop items; the OS menu stays away', async ({
  page,
}) => {
  await page.goto('/');
  await expectTouchMode(page);
  const icon = page.locator(`[data-app="${APP}"] .hl-app-icon`);
  await expect(icon).toBeVisible();
  // No OS callout or text selection on a tile, and the browser's own menu never opens.
  await expect(page.locator(`[data-app="${APP}"] .hl-app`)).toHaveCSS('user-select', 'none');
  const prevented = await page
    .locator(`[data-app="${APP}"] .hl-app`)
    .evaluate((el) => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  expect(prevented).toBe(true);

  // Vibration where the device has it: counted on the page.
  await page.evaluate(() => {
    (window as unknown as { buzzes: number }).buzzes = 0;
    navigator.vibrate = () => {
      (window as unknown as { buzzes: number }).buzzes++;
      return true;
    };
  });
  await longPress(page, icon);
  const menu = page.getByRole('menu', { name: /Tab vault/ });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Open',
    'Settings',
    'View logs',
    'Restart',
    'Stop',
    'Uninstall…',
    'Edit Home',
  ]);
  expect(await page.evaluate(() => (window as unknown as { buzzes: number }).buzzes)).toBe(1);
  // Beside the lifted tile, at the finger, with rows a finger can pick.
  const tile = await box(icon);
  const m = await box(menu);
  expect(m.x).toBeGreaterThan(tile.x + tile.width);
  expect(m.y).toBeLessThan(tile.y + tile.height);
  expect(m.y + m.height).toBeGreaterThan(tile.y);
  expect(Math.round(m.width)).toBe(272);
  for (const item of await menu.getByRole('menuitem').all()) {
    expect(Math.round((await box(item)).height)).toBeGreaterThanOrEqual(44);
  }
  // The press didn't open the app.
  await expect(page).toHaveURL(`${MAIN_URL}/`);
});

test('US-TAB-02 a tap outside closes the menu and opens nothing under it', async ({ page, context }) => {
  await page.goto('/');
  const icon = page.locator(`[data-app="${APP}"] .hl-app-icon`);
  const other = page.locator(`[data-app="${OTHER}"] .hl-app-icon`);
  await expect(other).toBeVisible();
  const under = await centre(other);
  await longPress(page, icon);
  const menu = page.getByRole('menu', { name: /Tab vault/ });
  await expect(menu).toBeVisible();
  const pages = context.pages().length;
  // A tap where another app's tile is, under the blurred layer.
  await page.touchscreen.tap(under.x, under.y);
  await expect(menu).toBeHidden();
  await page.waitForTimeout(500);
  expect(context.pages()).toHaveLength(pages);
  await expect(page).toHaveURL(`${MAIN_URL}/`);
});

test('US-TAB-02 a finger that moves more than 10px first is a scroll, not a menu', async ({ page }) => {
  await page.goto('/');
  const icon = page.locator(`[data-app="${APP}"] .hl-app-icon`);
  await expect(icon).toBeVisible();
  const at = await centre(icon);
  const finger = await Finger.down(page, at);
  await finger.move({ x: at.x, y: at.y - 30 }, 3);
  await finger.hold(700);
  await finger.up();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('US-TAB-02 a held file opens its menu at the finger; a tap outside closes it without opening the file', async ({
  page,
}) => {
  const folder = await homeFolder(page, 'tab02-files', { 'Taxes/a.txt': 'a', 'note.txt': 'hello' });
  try {
    await page.goto(`/files?path=${encodeURIComponent(folder.path)}`);
    const file = page.locator(`[data-path="${folder.path}/note.txt"]`);
    await expect(file).toBeVisible();
    const at = await centre(file);
    await longPress(page, file);
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Download' })).toBeVisible();
    // At the finger.
    const m = await box(menu);
    expect(Math.abs(m.x - at.x)).toBeLessThan(40);
    // Nothing was selected (no selection bar) and the file didn't open.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const taxes = await centre(page.locator(`[data-path="${folder.path}/Taxes"]`));
    // It closes on the tap's click, not its first touch: the finger is down and the menu is still there.
    const finger = await Finger.down(page, taxes);
    await page.waitForTimeout(100);
    await expect(menu).toBeVisible();
    await finger.up();
    await expect(menu).toBeHidden();
    await page.waitForTimeout(400);
    // Still in the folder: the tap that closed the menu didn't open Taxes.
    await expect(page).toHaveURL(new RegExp(`path=${encodeURIComponent(folder.path)}$`));
  } finally {
    folder.remove();
  }
});
