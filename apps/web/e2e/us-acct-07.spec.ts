// US-ACCT-07 · Password change errors (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

const NEW = 'a much longer passphrase';

test('US-ACCT-07 each problem shows on its field', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Change password' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change password' });
  await dialog.getByLabel('Current password').fill('not my password');
  await dialog.getByLabel('New password', { exact: true }).fill(NEW);
  await dialog.getByLabel('Confirm new password').fill('something else entirely');
  await dialog.getByLabel('Current password').focus();
  await expect(dialog.getByText("Passwords don't match")).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Change password' })).toBeDisabled();

  await dialog.getByLabel('Confirm new password').fill(NEW);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByText("That's not your current password")).toBeVisible();
  await expect(dialog.getByLabel('New password', { exact: true })).toHaveValue(NEW);
});
