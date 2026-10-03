// US-USE-06 · Sort the per-app table (main instance, signed in as an admin).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-USE-06 the table sorts by memory first, by a header from the keyboard, and remembers it', async ({ page }) => {
  await page.goto('/usage');
  // The first visit can wait on the dev server compiling the page.
  const table = page.getByRole('table', { name: 'Apps' });
  await expect(table).toBeVisible({ timeout: 15_000 });
  const memory = table.getByRole('columnheader', { name: /^Memory/ });
  await expect(memory).toHaveAttribute('aria-sort', 'descending');
  await expect(memory).toHaveText('Memory↓');

  await table.getByRole('button', { name: 'CPU' }).focus();
  await page.keyboard.press('Enter');
  const cpu = table.getByRole('columnheader', { name: /^CPU/ });
  await expect(cpu).toHaveAttribute('aria-sort', 'descending');
  await page.keyboard.press('Space');
  await expect(cpu).toHaveAttribute('aria-sort', 'ascending');
  await expect(memory).not.toHaveAttribute('aria-sort');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.reload();
  await expect(table.getByRole('columnheader', { name: /^CPU/ })).toHaveAttribute('aria-sort', 'ascending', {
    timeout: 15_000,
  });
  // Back to the default for the other specs on this instance.
  await page.evaluate(() => localStorage.removeItem('hlabs.usage.sort'));
});
