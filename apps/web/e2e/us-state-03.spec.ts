// US-STATE-03 · Handle a failed or stuck update (main instance). /healthz is answered as an update whose migrations
// fail would: first "updating", then "migration_failed".
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('US-STATE-03 migrations that failed end the updating state in "Can\'t reach hlabs" with the reason', async ({
  page,
}) => {
  let reason = 'updating';
  await page.route('**/healthz', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(
        reason === 'updating' ? { reason, step: 2, steps: 4, stepLabel: 'Restarting apps' } : { reason },
      ),
    }),
  );
  await page.goto('/');
  // The first visit can wait on the dev server compiling the page.
  await expect(page.getByRole('heading', { name: 'Updating hlabs' })).toBeVisible({ timeout: 30_000 });
  reason = 'migration_failed';
  await expect(page.getByRole('heading', { name: "Can't reach hlabs" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/hlabs couldn't update its database/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
