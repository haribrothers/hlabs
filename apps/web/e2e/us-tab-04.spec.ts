// US-TAB-04 · The Dock on a touch screen (tablet project): no magnification, names under a long press, a tap opens
// at once; the Dock floats clear of the home indicator with tiles of 44px or more (main instance). A held pinned app
// opens its menu, named after it (a first-run instance, whose Dock is its own).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL, MAIN_URL } from './instances';
import { removeFakeApps } from './invites';
import { finishOnboarding } from './onboarding';
import { box, centre, dock, expectTouchTarget, Finger, longPress, trpcCall } from './tablet';

test('US-TAB-04 the Dock by tapping: no magnification, a tap opens the area at once', async ({ page }) => {
  await page.goto('/');
  const nav = dock(page);
  await expect(nav).toHaveClass(/hl-dock-still/);
  const files = nav.getByRole('button', { name: 'Files' });
  const before = await box(files.locator('.hl-dock-tile'));
  await files.tap();
  await expect(page).toHaveURL(`${MAIN_URL}/files`);
  // The tile the finger left on stays its size (a desktop's hover would have grown it 1.35×).
  await expect(files.locator('.hl-dock-tile')).toHaveCSS('transform', 'none');
  const after = await box(files.locator('.hl-dock-tile'));
  expect(Math.round(after.width)).toBe(Math.round(before.width));
});

test('US-TAB-04 a name shows under a long press, and the press opens nothing', async ({ page }) => {
  await page.goto('/');
  const usage = dock(page).getByRole('button', { name: 'Settings' });
  const tip = usage.locator('.hl-dock-tip');
  const finger = await Finger.down(page, await centre(usage));
  await finger.hold(700);
  await expect(tip).toHaveCSS('opacity', '1');
  await expect(tip).toHaveText('Settings');
  await finger.up();
  await expect(tip).toHaveCSS('opacity', '0');
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(`${MAIN_URL}/`);
});

test('US-TAB-04 the Dock clears the home indicator and its tiles are 44px or more', async ({ page }) => {
  await page.goto('/');
  const nav = dock(page);
  await expect(nav).toBeVisible();
  const b = await box(nav);
  const height = page.viewportSize()!.height;
  // 28px off the edge in a browser (size-dock-edge-touch); more where the device reports a home indicator.
  expect(Math.round(height - (b.y + b.height))).toBeGreaterThanOrEqual(28);
  for (const tile of await nav.locator('[data-dock]').all()) await expectTouchTarget(tile);
});

test.describe('first-run instance', () => {
  test.use({ baseURL: FIRST_RUN_URL });
  const PINS = ['tab04-pin'];
  test.afterEach(async ({ request }) => {
    await removeFakeApps(request, FIRST_RUN_URL, PINS);
  });

  test('US-TAB-04 a held pinned app opens its menu, named after it', async ({ page, request }) => {
    await finishOnboarding(page, request);
    await request.post(`${FIRST_RUN_URL}/dev/fake-app`, { data: { id: PINS[0], name: 'Pinned tab' } });
    expect((await trpcCall(page, 'home.saveDock', { appIds: PINS }, true)).error).toBeUndefined();
    await page.goto('/');
    const pin = dock(page).getByRole('button', { name: 'Pinned tab' });
    await expect(pin).toBeVisible();
    await expectTouchTarget(pin);
    await longPress(page, pin);
    const menu = page.getByRole('menu', { name: 'Pinned tab' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Remove from Dock' })).toBeVisible();
    // Rows a finger can pick.
    for (const item of await menu.getByRole('menuitem').all()) {
      expect(Math.round((await box(item)).height)).toBeGreaterThanOrEqual(44);
    }
    // Held, not tapped: the app didn't open.
    await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
  });
});
