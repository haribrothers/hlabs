// US-USE-07 · See stopped and failing apps in the table (main instance, signed in as an admin). The desktop specs run
// before any spec installs an app, so this instance has none yet, unless a local run left some: then each row says
// its status.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-USE-07 no apps yet offers the App Store; otherwise every app says its status', async ({ page }) => {
  await page.goto('/usage');
  // The first visit can wait on the dev server compiling the page.
  const empty = page.getByRole('heading', { name: 'No apps yet' });
  const table = page.getByRole('table', { name: 'Apps' });
  await expect(empty.or(table)).toBeVisible({ timeout: 30_000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (await empty.isVisible()) {
    await page.getByRole('button', { name: 'Browse the App Store' }).click();
    await expect(page).toHaveURL(/\/store/);
    return;
  }
  for (const r of await table.locator('tbody tr').all()) {
    await expect(r.locator('td').last()).toHaveText(
      /^(Running|Stopped|Error|Starting|Updating|Restarting|Stopping|Rolling back|Installing|Install failed|Uninstalling)$/,
    );
  }
});
