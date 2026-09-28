// US-ACCT-03 · See and edit my profile (first-run instance, after onboarding).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-03 edit my name and colour; Account and the Home greeting follow', async ({ page, request }) => {
  await finishOnboarding(page, request);
  await page.goto('/settings/account');
  await expect(page.getByText(`${ADMIN.username} · Admin`)).toBeVisible();

  await page.getByRole('button', { name: 'Edit profile' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit profile' });
  await expect(dialog).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Escape closes the dialog, not Settings.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/settings\/account$/);

  await page.getByRole('button', { name: 'Edit profile' }).click();
  await dialog.getByLabel('Display name').fill('');
  await expect(dialog.getByText('Enter a name')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('Display name').fill('Hari P');
  await dialog.getByText('Amber').click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'Profile updated' })).toBeVisible();
  await expect(page.getByText('Hari P', { exact: true })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /, Hari P$/ })).toBeVisible();
});
