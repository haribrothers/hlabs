// US-PHONE-03 · Bottom sheets with soft spring and drag to dismiss (main instance): the install sheet as a sheet with
// a handle; dragged down past 30% it goes, a short slow drag springs back; the backdrop and "✕" close it; once a
// field changes only its buttons do; at most 92% of the screen tall; Reduce motion fades it.
import { expect, test, type Page } from '@playwright/test';
import { box, phoneOnly } from './phone';

const APP = '/store/app/audiobookshelf?install=true';

async function drag(page: Page, from: { x: number; y: number }, dy: number, steps: number, pause = 0) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x, from.y + (dy * i) / steps);
    if (pause) await page.waitForTimeout(pause);
  }
  await page.mouse.up();
}

test('US-PHONE-03 a sheet with a handle; a long drag closes it, a short slow one springs back', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto(APP);
  const sheet = page.getByRole('dialog', { name: /Install Audiobookshelf/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.hl-sheet-handle')).toBeVisible();
  await expect(page.locator('.hl-scrim')).toBeVisible();
  const viewport = page.viewportSize()!;
  // Settled on the spring: at the bottom edge, at most 92% of the screen tall.
  await expect.poll(async () => Math.round((await box(sheet)).y + (await box(sheet)).height)).toBe(viewport.height);
  const b = await box(sheet);
  expect(b.height).toBeLessThanOrEqual(viewport.height * 0.92 + 1);

  const handle = await box(sheet.locator('.hl-sheet-handle'));
  const grab = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await drag(page, grab, 40, 4, 120);
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.round((await box(sheet)).y)).toBe(Math.round(b.y));

  await drag(page, grab, b.height * 0.5, 6);
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/store\/app\/audiobookshelf$/);
});

test('US-PHONE-03 the backdrop, Cancel and a dialog\'s "✕" Close dismiss it; focus goes back', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/store/app/audiobookshelf');
  const install = page.getByRole('main').getByRole('button', { name: 'Install', exact: true });
  await install.click();
  const sheet = page.getByRole('dialog', { name: /Install Audiobookshelf/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
  await expect(install).toBeFocused();
  await install.click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(sheet).toBeHidden();
  // A dialog that becomes a sheet (Notifications) has "✕", labelled Close.
  await page.goto('/');
  const bell = page.getByRole('button', { name: /^Notifications/ });
  await bell.click();
  const notes = page.getByRole('dialog', { name: 'Notifications' });
  await expect(notes.locator('.hl-sheet-handle')).toBeVisible();
  await notes.getByRole('button', { name: 'Close' }).click();
  await expect(notes).toBeHidden();
  await expect(bell).toBeFocused();
});

test('US-PHONE-03 with changed fields neither drag nor backdrop closes it', async ({ page }, info) => {
  phoneOnly(info);
  await page.goto(APP);
  const sheet = page.getByRole('dialog', { name: /Install Audiobookshelf/ });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('switch').first().click();
  const b = await box(sheet);
  const handle = await box(sheet.locator('.hl-sheet-handle'));
  await drag(page, { x: handle.x + 10, y: handle.y + 2 }, b.height * 0.6, 6);
  await page.mouse.click(20, 20);
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
});

test('US-PHONE-03 with Reduce motion it fades in instead of sliding', async ({ page }, info) => {
  phoneOnly(info);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(APP);
  const sheet = page.getByRole('dialog', { name: /Install Audiobookshelf/ });
  await expect(sheet).toBeVisible();
  // It never moves: no translate on the way in.
  expect(await sheet.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
});
