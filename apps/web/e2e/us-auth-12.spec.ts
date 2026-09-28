// US-AUTH-12 · Pause logins after too many attempts (first-run instance, after onboarding).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FIRST_RUN_URL } from './instances';
import { ADMIN, finishOnboarding } from './onboarding';

test.use({ baseURL: FIRST_RUN_URL });

test('US-AUTH-12 five failures pause logging in as that user, with a countdown', async ({ page, request, browser }) => {
  await finishOnboarding(page, request);
  const other = await (await browser.newContext({ baseURL: FIRST_RUN_URL })).newPage();
  await other.goto('/login/username');
  const password = other.getByLabel('Password', { exact: true });
  await other.getByLabel('Username').fill(ADMIN.username);
  for (let i = 0; i < 5; i++) {
    await password.fill('not the password');
    await other.getByRole('button', { name: 'Log in' }).click();
    if (i < 4) await expect(password).toHaveValue('');
  }

  await expect(other).toHaveURL(/\/login\/locked\?/);
  await expect(other.getByRole('heading', { level: 1, name: 'Too many attempts' })).toBeFocused();
  await expect(other.getByText('For your security, logging in as @hari is paused.')).toBeVisible();
  const timer = other.getByRole('timer');
  await expect(timer).toHaveText(/^1[45]:\d\d$/);
  const first = await timer.innerText();
  await expect(timer).not.toHaveText(first);
  await expect(other.getByRole('button', { name: /^Try again in \d+:\d\d$/ })).toBeDisabled();
  // US-AUTH-13: the admin is told.
  await expect(other.getByText('The admin gets a notification about repeated failed logins.')).toBeVisible();
  expect((await new AxeBuilder({ page: other }).analyze()).violations).toEqual([]);

  // The right password is refused while paused.
  await other.goto('/login/username');
  await other.getByLabel('Username').fill(ADMIN.username);
  await password.fill(ADMIN.password);
  await other.getByRole('button', { name: 'Log in' }).click();
  await expect(other).toHaveURL(/\/login\/locked\?/);

  // Use another account.
  await other.getByRole('link', { name: 'Use another account' }).click();
  await expect(other).toHaveURL(/\/login\/(users|username)$/);
});
