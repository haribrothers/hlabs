// US-USE-05 · Use the charts with a keyboard and screen reader (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-USE-05 the main chart can be read with the keyboard alone, and in forced colours', async ({ page }) => {
  await page.goto('/usage');
  // The first visit can wait on the dev server compiling the page.
  const cpu = page.getByRole('button', { name: /^CPU/ });
  await expect(page.locator('figcaption').first()).toContainText('Peak', { timeout: 15_000 });

  // From the CPU tile, Tab past the other three tiles to the chart.
  await cpu.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  const chart = page.getByRole('img', { name: /^CPU over the last hour\./ });
  await expect(chart).toBeFocused();
  await page.keyboard.press('End');
  const announced = page.getByRole('status').filter({ hasText: /CPU \d+%/ });
  await expect(announced).toHaveText(/^\d\d:\d\d, CPU \d+%$/);
  await page.keyboard.press('Home');
  await expect(announced).toHaveText(/^\d\d:\d\d, CPU \d+%$/);
  const tableId = await chart.getAttribute('aria-describedby');
  await expect(page.locator(`table[id="${tableId}"] th[scope="col"]`).first()).toHaveText('Time');

  // Network: two series, each its own line style in forced colours.
  await page.getByRole('button', { name: /^Network/ }).click();
  await page.emulateMedia({ forcedColors: 'active' });
  const lines = page.locator('.hl-chart-line');
  await expect(lines).toHaveCount(2);
  const dashes = await lines.evaluateAll((els) => els.map((el) => getComputedStyle(el).strokeDasharray));
  expect(new Set(dashes).size).toBe(2);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ forcedColors: 'none' });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
