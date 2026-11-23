// US-PHONE-06 · Two-factor, lockout and forgot password on phone (first-run instance): the code step full-screen with
// a numeric one-time-code field that submits itself, the lockout counting down, and ForgotPassword with its way back.
import { expect, test } from '@playwright/test';
import { generateSync } from 'otplib';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding, finishOnboardingWithTwoFactor, passwordStep } from './onboarding';
import { phoneOnly } from './phone';

test.use({ baseURL: FIRST_RUN_URL });

test('US-PHONE-06 the code step: numeric, one-time-code, and the sixth digit logs in', async ({
  page,
  request,
  context,
}, info) => {
  phoneOnly(info);
  test.setTimeout(90_000);
  const { secret } = await finishOnboardingWithTwoFactor(page, request);
  await context.clearCookies();
  await passwordStep(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Enter your code' })).toBeVisible();
  const first = page.getByLabel('Digit 1');
  await expect(first).toHaveAttribute('inputmode', 'numeric');
  await expect(first).toHaveAttribute('autocomplete', 'one-time-code');
  const code = generateSync({ secret, epoch: Math.floor(Date.now() / 1000) });
  for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(code[i]!);
  await expect(page).toHaveURL(new RegExp(`^${FIRST_RUN_URL}/settings(/account)?$`));
});

test('US-PHONE-06 locked: the 15 minutes count down; Forgot password? is a page with ‹ Log in', async ({
  page,
  request,
  context,
}, info) => {
  phoneOnly(info);
  await finishOnboarding(page, request);
  await context.clearCookies();
  await page.goto('/login/username');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible();
  await expect(page.getByText("hlabs doesn't use email, so resets happen at home.")).toBeVisible();
  // A full-screen page with "‹ Log in" (PhoneRedesignA_ForgotPassword).
  await page.getByRole('link', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login\/username/);

  const password = page.getByLabel('Password', { exact: true });
  await page.getByLabel('Username').fill(ADMIN.username);
  for (let i = 0; i < 5; i++) {
    await password.fill('not the password');
    await page.getByRole('button', { name: 'Log in' }).click();
    if (i < 4) await expect(password).toHaveValue('');
  }
  await expect(page).toHaveURL(/\/login\/locked\?/);
  await expect(page.getByRole('heading', { level: 1, name: 'Too many attempts' })).toBeVisible();
  const timer = page.getByRole('timer');
  await expect(timer).toHaveText(/^1[45]:\d\d$/);
  const at = await timer.textContent();
  await expect(timer).not.toHaveText(at!, { timeout: 3_000 });
});
