// US-AUTH-18 · Return to where I was going after login (first-run instance, two-factor on). App hostnames arrive in
// phase 2; here `next` is a dashboard route and an address hlabs doesn't know.
import { expect, test } from '@playwright/test';
import { generateSync } from 'otplib';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboardingWithTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-18 next survives the list, the password and the code step', async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  const { secret } = await finishOnboardingWithTwoFactor(page, request);
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  const logIn = async (next: string, steps: number) => {
    await other.goto(`/login?next=${encodeURIComponent(next)}`);
    await other.getByRole('button', { name: new RegExp(`^${ADMIN.name}`) }).click();
    await other.getByPlaceholder('Password').fill(ADMIN.password);
    await other.getByRole('button', { name: 'Log in' }).click();
    await expect(other).toHaveURL(/\/login\/code\?/);
    const code = generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 * steps });
    for (let i = 0; i < 6; i++) await other.getByLabel(`Digit ${i + 1}`).fill(code[i]!);
  };

  await logIn('/files', 0);
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/files`);

  // Somewhere hlabs doesn't know: Home instead.
  await other.context().clearCookies();
  await other.evaluate(() => localStorage.clear());
  await logIn('https://evil.example/', 1);
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/`);
});
