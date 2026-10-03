// US-USE-04 · Read a metric's history and its peak (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-USE-04 the tiles pick the main chart, from the keyboard too', async ({ page }) => {
  await page.goto('/usage');
  // The first visit can wait on the dev server compiling the page.
  const cpu = page.getByRole('button', { name: /^CPU/ });
  await expect(cpu).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect(page.locator('figcaption').first()).toContainText(/CPU over the last hour\s*Peak \d+% at \d\d:\d\d/, {
    timeout: 15_000,
  });

  const storage = page.getByRole('button', { name: /^Storage/ });
  await storage.focus();
  await page.keyboard.press('Enter');
  await expect(storage).toHaveAttribute('aria-pressed', 'true');
  await expect(cpu).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('figcaption').first()).toContainText('Storage by use');

  await page.getByRole('button', { name: /^Network/ }).click();
  await expect(page.locator('figcaption').first()).toContainText('Network over the last hour');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
