// US-ONB-20 · Skip starter apps (first-run instance, phase 2 previewed, D-092): Back keeps storage's choice, Skip
// installs nothing and the finish screen has no Installing row. Home's empty state is US-HOME-15 (phase 7).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { createAdminInUi, skipTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ONB-20 Back returns to storage; Skip finishes with no apps', async ({ page, request }) => {
  await createAdminInUi(page, request);
  await skipTwoFactor(page);
  await page.getByRole('radio', { name: /This computer/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/apps`);

  // Back: storage, as it was saved (remote access waits for phase 3).
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/storage`);
  await expect(page.getByRole('radio', { name: /This computer/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/apps`);

  // A tile picked, then Skip anyway: nothing installs.
  await page.getByRole('list', { name: 'Starter apps' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup/done`);
  await expect(page.getByText('hlabs keeps running from the menu bar.')).toBeVisible();
  const summary = page.getByRole('group', { name: 'What was set up' });
  await expect(summary).toContainText('This computer');
  await expect(summary).not.toContainText('Installing');

  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);
  const apps = await page.evaluate(async () => {
    const res = await fetch('/trpc/apps.list');
    return ((await res.json()) as { result: { data: { apps: unknown[] } } }).result.data.apps;
  });
  expect(apps).toEqual([]);
});
