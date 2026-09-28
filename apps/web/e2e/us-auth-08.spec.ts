// US-AUTH-08 · Enter my two-factor code (first-run instance, after onboarding with two-factor on).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { generateSync } from 'otplib';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, createAdminInUi, turnOnTwoFactor } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-08 after the password, the 6-digit code logs in and goes to next', async ({ page, request, browser }) => {
  test.setTimeout(90_000);
  await createAdminInUi(page, request);
  const { secret } = await turnOnTwoFactor(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/setup\/done$/);
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page).toHaveURL(`${FIRST_RUN_URL}/`);

  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  const password = async () => {
    await other.goto('/login/username?next=%2Fsettings');
    await other.getByLabel('Username').fill(ADMIN.username);
    await other.getByLabel('Password', { exact: true }).fill(ADMIN.password);
    await other.getByRole('button', { name: 'Log in' }).click();
    await expect(other).toHaveURL(/\/login\/code\?/);
  };
  const type = async (code: string) => {
    for (let i = 0; i < 6; i++) await other.getByLabel(`Digit ${i + 1}`).fill(code[i]!);
  };

  // A wrong code: a message, the boxes cleared, the first one focused.
  await password();
  await expect(other.getByRole('heading', { level: 1, name: 'Enter your code' })).toBeVisible();
  await expect(other.getByLabel('Digit 1')).toBeFocused();
  expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);
  const right = generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + 30 });
  await type(right === '000000' ? '111111' : '000000');
  await expect(other.getByText("That code didn't work. Check the time on your phone and try again.")).toBeVisible();
  await expect(other.getByLabel('Digit 1')).toBeFocused();

  // Back keeps next.
  await other.getByRole('button', { name: 'Back' }).click();
  await expect(other).toHaveURL(/\/login\/username\?next=%2Fsettings$/);

  // The right code (the sixth digit submits) goes on to next.
  await password();
  await type(right);
  await expect(other).toHaveURL(`${FIRST_RUN_URL}/settings`);
});
