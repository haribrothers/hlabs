// US-SYS-29 · See what hlabs connects to (main instance, admin): the list names the update server (a closed local
// port in e2e) with why, and says hlabs sends no usage data or crash reports.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-SYS-29 "What hlabs connects to" lists the outside services and says there is no telemetry', async ({
  page,
}) => {
  await page.goto('/settings/advanced');
  await page.getByRole('button', { name: 'View What hlabs connects to' }).click();
  const dialog = page.getByRole('dialog', { name: 'What hlabs connects to' });
  await expect(dialog).toContainText('hlabs sends no usage data or crash reports.');
  await expect(dialog).toContainText('hlabs updates');
  await expect(dialog).toContainText('127.0.0.1:9');
  await expect(dialog).toContainText('Checks for hlabs updates every 6 hours');
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});
