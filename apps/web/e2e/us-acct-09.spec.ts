// US-ACCT-09 · View, download and print recovery codes (first-run instance, two-factor on during setup). Plain codes
// right after making new ones are covered by US-ACCT-10.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboardingWithTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-ACCT-09 stored codes show masked; Download and Print wait for new codes', async ({ page, request }) => {
  test.setTimeout(90_000);
  await finishOnboardingWithTwoFactor(page, request);
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'View recovery codes' }).click();
  const dialog = page.getByRole('dialog');
  const codes = dialog.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem');
  await expect(codes).toHaveCount(10);
  await expect(codes.first()).toHaveText('••••-••••');
  await expect(dialog.getByRole('button', { name: 'Download' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Print' })).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
