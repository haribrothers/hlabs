// US-SYS-38 · Reset hlabs (first-run instance only: its own data dir and secrets, no apps; e2e starts it again on exit
// 75): the reset shows "Resetting hlabs…", then this browser lands on setup's Welcome, with nobody signed in.
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-SYS-38 a factory reset deletes everything and lands on Welcome', async ({ page, request }) => {
  test.setTimeout(120_000);
  await finishOnboarding(page, request);
  await page.goto('/settings/advanced');
  await page.getByRole('group', { name: 'Danger zone' }).getByRole('button', { name: 'Reset…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Reset hlabs to factory settings?' });
  await dialog.getByLabel('Your password').fill(ADMIN.password);
  await dialog.getByLabel('Type hlabs to confirm').fill('hlabs');
  await dialog.getByRole('button', { name: 'Reset hlabs' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Resetting hlabs…' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to hlabs' })).toBeVisible({ timeout: 90_000 });
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/setup`);
  const status = await (await request.get(`${FIRST_RUN_URL}/trpc/onboarding.status`)).json();
  expect(status.result.data).toMatchObject({ completed: false, hasUsers: false });
});
