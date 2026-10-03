// US-AUTH-20 · Understand how to reset a forgotten password: "Forgot password?" on the log-in screens opens
// ForgotPassword, and "Back to log in" returns with next kept (first-run instance, after onboarding).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-20 Forgot password? explains the resets and goes back', async ({ page, request, browser }) => {
  await finishOnboarding(page, request);
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await other.goto('/login/username?next=%2Ffiles');
  await other.getByLabel('Username').fill('hari');
  await other.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(other).toHaveURL(/\/login\/forgot\?/);
  await expect(other.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible();
  await expect(other.getByText('sudo hlabs reset-password hari')).toBeVisible();
  await expect(other.getByText(/recovery code/i)).toHaveCount(0);
  expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);

  await other.getByRole('link', { name: 'Back to log in' }).click();
  await expect(other).toHaveURL(/\/login\/username\?next=%2Ffiles$/);
});
