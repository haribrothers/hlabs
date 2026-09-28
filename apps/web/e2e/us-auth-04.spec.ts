// US-AUTH-04 · See a clear error when login fails (first-run instance, after onboarding).
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-04 wrong details get one message; the fifth failure locks', async ({ page, request, browser }) => {
  await finishOnboarding(page, request);
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await other.goto('/login/username');
  const password = other.getByLabel('Password', { exact: true });

  // An unknown account, then four wrong passwords for hari: all the same message.
  for (const username of ['nobody', 'hari', 'hari', 'hari', 'hari']) {
    await other.getByLabel('Username').fill(username);
    await password.fill('not the password');
    await other.getByRole('button', { name: 'Log in' }).click();
    await expect(other.getByText('Username or password is incorrect.')).toBeVisible();
    await expect(password).toHaveValue('');
    await expect(password).toBeFocused();
    await expect(other.getByLabel('Username')).toHaveValue(username);
  }

  // The fifth failure for hari from this IP.
  await password.fill('not the password');
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(/\/login\/locked$/);
});
