// US-TAB-01 · Touch-sized controls on a tablet (tablet project, main instance): an iPad by touch gets
// <html data-input="touch"> and the desktop layout (the Dock, windows); buttons, rows, switches, tabs and Dock tiles are
// 44px or more and fields 16px text; what shows on hover on a computer is there all the time; a mouse plugged in brings
// the mouse layout back without a reload.
import { expect, test } from '@playwright/test';
import { MAIN_URL } from './instances';
import { box, centre, dock, expectTouchMode, expectTouchTarget, Finger, trpcCall } from './tablet';

const APP = 'tab01-app';

test.beforeEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: APP, name: 'Tab sized', state: 'running' } });
});
test.afterEach(async ({ request }) => {
  await request.post(`${MAIN_URL}/dev/fake-app`, { data: { id: APP, remove: true } });
});

test('US-TAB-01 a touch screen at 768px and wider gets data-input="touch" and the desktop layout', async ({ page }) => {
  await page.goto('/');
  await expectTouchMode(page);
  await expect(dock(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Tab bar' })).toHaveCount(0);
  // Home's greeting as the desktop has it (not the phone's large title), and Edit Home a button beside the bell.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '40px');
  await expectTouchTarget(page.getByRole('button', { name: 'Edit Home' }));
  for (const tile of await dock(page).locator('[data-dock]').all()) await expectTouchTarget(tile);
});

test('US-TAB-01 buttons, tabs, switches and rows are 44px or more; fields are 16px text', async ({ page }) => {
  await page.goto(`/?settings=${APP}`);
  const win = page.getByRole('dialog', { name: 'App settings' });
  await expect(win).toBeVisible();
  for (const name of ['Open', 'Restart', 'Stop', 'Logs', 'Close'])
    await expectTouchTarget(win.getByRole('button', { name, exact: true }).first());
  for (const tab of await win.getByRole('tab').all()) await expectTouchTarget(tab);
  const switches = win.getByRole('switch');
  await expect(switches.first()).toBeVisible();
  for (const s of await switches.all()) await expectTouchTarget(s);
  for (const row of await win.locator('.hl-list-row').all()) {
    expect(Math.round((await box(row)).height)).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
  // A text field: Search.
  await page.getByRole('button', { name: /Search apps, files, settings/ }).click();
  const field = page.getByRole('combobox').or(page.getByRole('searchbox')).first();
  await expect(field).toBeVisible();
  const size = await field.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

test('US-TAB-01 what shows on hover on a computer is shown all the time; a Dock name shows on a long press', async ({
  page,
  request,
}) => {
  const made = await request.post(`${MAIN_URL}/dev/notify`, {
    data: { title: 'Tablet hover check', body: 'Shown on touch', severity: 'info' },
  });
  const { notificationId } = (await made.json()) as { notificationId: string };
  await page.goto('/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  const dismiss = panel.locator('.hl-hover-reveal').first();
  await expect(dismiss).toBeVisible();
  await expect(dismiss).toHaveCSS('opacity', '1');
  await expectTouchTarget(dismiss);
  await page.keyboard.press('Escape');
  // A Dock tile's name: hidden after a tap's hover, shown while a finger rests on it.
  const files = dock(page).getByRole('button', { name: 'Files' });
  const tip = files.locator('.hl-dock-tip');
  await expect(tip).toHaveCSS('opacity', '0');
  const finger = await Finger.down(page, await centre(files));
  await finger.hold(700);
  await expect(tip).toHaveCSS('opacity', '1');
  await finger.up();
  await expect(tip).toHaveCSS('opacity', '0');
  // The long press didn't open Files.
  await expect(page).toHaveURL(`${MAIN_URL}/`);
  await trpcCall(page, 'notifications.dismiss', { ids: [notificationId] }, true);
});

test('US-TAB-01 plugging in a mouse brings the mouse layout back without a reload', async ({ page }) => {
  await page.goto('/');
  await expectTouchMode(page);
  const marker = await page.evaluate(() => ((window as unknown as { marker: number }).marker = Math.random()));
  const cdp = await page.context().newCDPSession(page);
  // A mouse instead of the touch screen: (hover: none) and (pointer: coarse) stops matching.
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await expect(page.locator('html')).not.toHaveAttribute('data-input', 'touch');
  // The desktop's own 38px icon buttons and magnifying Dock again, on the same page.
  await expect(dock(page)).not.toHaveClass(/hl-dock-still/);
  expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(marker);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await expectTouchMode(page);
});

test("US-TAB-01 a chart's tooltip shows under a held finger, not after a tap", async ({ page }) => {
  await page.goto('/usage');
  const chart = page.locator('figure.hl-chart svg').first();
  await expect(chart).toBeVisible();
  const b = await box(chart);
  const at = { x: b.x + b.width * 0.6, y: b.y + b.height / 2 };
  await page.touchscreen.tap(at.x, at.y);
  await expect(page.locator('.hl-chart-tip')).toHaveCount(0);
  const finger = await Finger.down(page, at);
  await finger.hold(700);
  await expect(page.locator('.hl-chart-tip').first()).toBeVisible();
  await finger.up();
  await expect(page.locator('.hl-chart-tip')).toHaveCount(0);
});
