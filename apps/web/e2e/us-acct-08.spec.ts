// US-ACCT-08 · See my two-factor and recovery code status (first-run instance, two-factor on during setup).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboardingWithTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-08 Security shows two-factor and the codes; Manage opens TwoFactorManage', async ({ page, request }) => {
  test.setTimeout(90_000);
  await finishOnboardingWithTwoFactor(page, request);
  await page.goto('/settings/account');
  await expect(page.getByText('On · authenticator app')).toBeVisible();
  await expect(page.getByText('10 of 10 unused')).toBeVisible();

  const manage = page.getByRole('button', { name: 'Manage two-factor login' });
  await manage.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Added when you set up hlabs')).toBeVisible();
  await expect(dialog.getByText('Recovery codes · 10 of 10 unused')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(manage).toBeFocused();

  // By address (the recovery-code toast links here): Account with the dialog open; Done goes back to Account.
  await page.goto('/settings/account/two-factor');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/settings\/account$/);
});
