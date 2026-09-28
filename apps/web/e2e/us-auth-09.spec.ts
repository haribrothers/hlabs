// US-AUTH-09 · Log in with a recovery code (first-run instance, after onboarding with two-factor on).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboardingWithTwoFactor, passwordStep } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-09 a saved recovery code logs in once', async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  const codes = await finishOnboardingWithTwoFactor(page, request);
  const context = await browser.newContext({ baseURL: FIRST_RUN_URL });
  const other = await context.newPage();

  // Typed without the dash, in capitals.
  await passwordStep(other);
  await other.getByRole('button', { name: 'Use a recovery code' }).click();
  await expect(other.getByRole('button', { name: 'Use my authenticator app' })).toBeVisible();
  await other.getByLabel('Recovery code').fill(codes[0]!.replace('-', '').toUpperCase());
  await other.getByRole('button', { name: 'Verify' }).click();
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/settings`);
  await expect(other.getByRole('status').filter({ hasText: 'Recovery code used. You have 9 left.' })).toBeVisible();

  // The same code again doesn't work.
  await context.clearCookies();
  await passwordStep(other);
  await other.getByRole('button', { name: 'Use a recovery code' }).click();
  await other.getByLabel('Recovery code').fill(codes[0]!);
  await other.getByLabel('Recovery code').press('Enter');
  await expect(other.getByText("That recovery code didn't work.")).toBeVisible();
});
