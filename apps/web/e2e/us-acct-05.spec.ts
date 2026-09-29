// US-ACCT-05 · Sign out a device, or log out (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('US-ACCT-05 signing out another device sends it to log in; Log out ends this one', async ({
  page,
  request,
  browser,
}) => {
  await finishOnboarding(page, request);
  const phone = await (await browser.newContext({ baseURL: FIRST_RUN_URL, userAgent: IPHONE })).newPage();
  await phone.goto('/login/username');
  await phone.getByLabel('Username').fill(ADMIN.username);
  await phone.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await phone.getByRole('button', { name: 'Log in' }).click();
  await expect(phone).toHaveURL(`${FIRST_RUN_URL}/`);

  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Sign out iPhone' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Signed out iPhone' })).toBeVisible();
  await expect(page.getByText('iPhone · Safari')).toHaveCount(0);
  // The open dashboard on the phone goes to log in within 2 seconds.
  await expect(phone).toHaveURL(/\/login/, { timeout: 2000 });

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
});
