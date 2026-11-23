// US-PHONE-09 · Search from Home on phone (main instance): Search opens Spotlight over the whole screen with the field
// focused; results in rows at least 52 px tall; Cancel closes it and Home is where it was.
import { expect, test } from '@playwright/test';
import { box, phoneOnly } from './phone';

test('US-PHONE-09 full-screen search with the field focused, 52 px rows, and Cancel back to Home as it was', async ({
  page,
}, info) => {
  phoneOnly(info);
  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Apps' })).toBeVisible();
  const main = page.locator('#main');
  await main.evaluate((el) => el.scrollTo({ top: 120 }));
  const before = await main.evaluate((el) => el.scrollTop);
  await page.getByRole('main').getByRole('button', { name: 'Search' }).click();
  const panel = page.getByRole('dialog', { name: 'Search' });
  await expect(panel).toBeVisible();
  const p = await box(panel);
  const viewport = page.viewportSize()!;
  expect(Math.round(p.width)).toBe(viewport.width);
  expect(Math.round(p.height)).toBe(viewport.height);
  const field = panel.getByRole('combobox', { name: 'Search' });
  await expect(field).toBeFocused();
  await field.fill('a');
  const option = panel.getByRole('option').first();
  await expect(option).toBeVisible();
  expect((await box(option)).height).toBeGreaterThanOrEqual(52);
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toBeHidden();
  expect(await main.evaluate((el) => el.scrollTop)).toBe(before);
});
